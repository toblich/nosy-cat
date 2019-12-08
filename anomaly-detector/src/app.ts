import { consume } from "./kafka-integration";

import {
  logger,
  createZipkinContextTracer,
  DependencyDetectionMessage,
  generateGraphClient,
  ComponentStatus,
  ComponentCall,
  Component,
  Dictionary
} from "helpers";
import thresholds from "./thresholds";
import { MetricTypes, Range, Metrics } from "./types";
import { capitalize, mapValues } from "lodash";
import { PulsarProducer, getPulsarProducer } from "./pulsar";

const { tracer } = createZipkinContextTracer("anomaly-detector");

consume(tracer, "dependency-detector", onEveryMessage);

// Test pulsar method
// (async (): Promise<void> => {
//   const pulsarProducer = await getPulsarProducer("component-alerts");

//   // tslint:disable-next-line: one-variable-per-declaration
//   const serviceName = "Test",
//     type = MetricTypes.errorRate,
//     threshold = -1,
//     value = -100;
//   logger.info("Sending test pulsar message");
//   await pulsarProducer.send({
//     data: Buffer.from(JSON.stringify([getMetricErrorMessage(type, value, threshold, serviceName)]))
//   });
//   logger.info("Test pulsar message sent!");
// })();

const graphClient = generateGraphClient(
  `http://${process.env.GRAPH_HOST || "localhost"}:${process.env.GRAPH_PORT || 4000}`
);

// ---

function getErrorsByMetric(serviceThresholds: Metrics, service: Component): Dictionary<boolean> {
  return mapValues(serviceThresholds, (threshold: Range, metricKey: string): boolean =>
    metricHasAnomaly(threshold, service.metrics[metricKey])
  );
}

export async function processComponentCall(producer: PulsarProducer, serviceValue: ComponentCall): Promise<void> {
  const component = (await graphClient.getService(serviceValue.callee)).body;

  const serviceThresholds: Metrics = {
    errorRate: getServiceThreshold(serviceValue, "errorRate"),
    meanResponseTimeMs: getServiceThreshold(serviceValue, "meanResponseTimeMs"),
    throughput: getServiceThreshold(serviceValue, "throughput")
  };
  logger.debug(`thresholds: ${JSON.stringify(serviceThresholds, null, 2)}`);
  logger.debug(`component: ${JSON.stringify(component, null, 2)}`);

  const errorsByMetric = getErrorsByMetric(serviceThresholds, component);
  logger.debug(`errorsByMetric: ${JSON.stringify(errorsByMetric, null, 2)}`);

  const serviceHasAnError = Object.keys(errorsByMetric).some((metricKey: string) => errorsByMetric[metricKey]);

  logger.debug(`serviceHasAnError: ${serviceHasAnError}`);
  const serviceIsBackToNormal = wasServiceAnomalous(component.status) && !serviceHasAnError;
  logger.debug(`serviceIsBackToNormal: ${serviceIsBackToNormal}`);

  if (serviceIsBackToNormal) {
    await graphClient.updateServiceMetrics(component.id, ComponentStatus.NORMAL);
  }

  if (!serviceHasAnError) {
    return;
  }

  const serviceIsStillAnomalous = wasServiceAnomalous(component.status) && serviceHasAnError;

  if (serviceIsStillAnomalous) {
    return;
  }

  const errorMessages = mapValues(
    errorsByMetric,
    (metricHasError: boolean, metricKey: string): string =>
      metricHasError &&
      getMetricErrorMessage(
        MetricTypes[metricKey],
        component.metrics[metricKey],
        serviceThresholds[metricKey],
        serviceValue.callee
      )
  );

  const pulsarProducer = await getPulsarProducer("component-alerts");

  await pulsarProducer.send({
    data: Buffer.from(JSON.stringify(errorMessages))
  });

  await graphClient.updateServiceMetrics(component.id, ComponentStatus.CONFIRMED);
}

interface Entry {
  partition: any;
  message: DependencyDetectionMessage;
}

async function onEveryMessage(producer: PulsarProducer, entries: Entry[]): Promise<void> {
  const processMessages = entries.map(async (entry: Entry) => {
    const { partition, message } = entry;

    try {
      logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

      const componentCalls: ComponentCall[] = JSON.parse(message.value.toString());

      await Promise.all(
        componentCalls.map((componentCall: ComponentCall) => processComponentCall(producer, componentCall))
      );
    } catch (error) {
      logger.error(`Error processing an entry: ${error}`);
      logger.data(`The entry was: ${JSON.stringify(entry)}`);
    }
  });

  await Promise.all(processMessages);
}

function getServiceThreshold(value: ComponentCall, type: keyof Metrics): Range {
  if (!thresholds[value.callee]) {
    thresholds[value.callee] = {
      errorRate: { minimum: 0, maximum: 0.5 },
      meanResponseTimeMs: { minimum: 0, maximum: 1200000 },
      throughput: {
        minimum: 0,
        maximum: 10000
      }
    };
  }

  return thresholds[value.callee][type];
}

function metricHasAnomaly(threshold: Range, value: number): boolean {
  return value < threshold.minimum || value > threshold.maximum;
}

function wasServiceAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}

function getMetricErrorMessage(type: MetricTypes, value: number, threshold: number, serviceName: string): any {
  const message = `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value is ${JSON.stringify(threshold)} and the current value is ${value}`;

  return {
    serviceName,
    type,
    expected: threshold,
    value,
    message
  };
}
