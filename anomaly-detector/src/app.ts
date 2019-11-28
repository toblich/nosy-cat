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

  const errorsByMetric = getErrorsByMetric(serviceThresholds, component);

  const serviceHasAnError = Object.keys(errorsByMetric).some((metricKey: string) => errorsByMetric[metricKey]);

  const serviceIsBackToNormal = wasServiceAnomalous(component.status) && !serviceHasAnError;

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
      meanResponseTimeMs: { minimum: 0, maximum: 1200 },
      throughput: {
        minimum: 0.8,
        maximum: 1.2
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

function getMetricErrorMessage(type: MetricTypes, value: number, threshold: number, serviceName: string): string {
  return `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value is ${threshold} and the current value is ${value}`;
}
