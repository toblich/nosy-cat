import { consume } from "./kafka-integration";

import {
  logger,
  createZipkinContextTracer,
  DependencyDetectionMessage,
  generateGraphClient,
  ComponentStatus,
  ComponentCall,
  Component,
  ComponentMetrics,
  Dictionary
} from "helpers";
import thresholds from "./thresholds";
import { MetricTypes, Range, Metrics } from "./types";
import { capitalize, mapValues } from "lodash";

const { tracer } = createZipkinContextTracer("anomaly-detector");

consume(tracer, "dependency-detector", onEveryMessage);

const graphClient = generateGraphClient(`http://localhost:${process.env.GRAPH_PORT || 6000}`);

// ---

function getErrorsByMetric(serviceThresholds: Metrics, service: Component): Dictionary<boolean> {
  return mapValues(serviceThresholds, (_: any, metricKey: string): boolean =>
    metricHasAnomaly(serviceThresholds[metricKey], service.metrics[metricKey])
  );
}

export async function processComponentCall(serviceValue: ComponentCall): Promise<void> {
  const component = (await graphClient.getService(serviceValue.callee)).body;

  const serviceThresholds: Metrics = {
    errorRate: getServiceThreshold(serviceValue, "errorRate"),
    meanResponseTimeMs: getServiceThreshold(serviceValue, "meanResponseTimeMs"),
    throughput: getServiceThreshold(serviceValue, "throughput")
  };

  const errorsByMetric = getErrorsByMetric(serviceThresholds, component);

  const serviceHasAnError = Object.keys(errorsByMetric).some((metricKey: string) => errorsByMetric[metricKey]);

  const serviceIsBackToNormal = isServiceAnomalous(component.status) && !serviceHasAnError;

  if (serviceIsBackToNormal) {
    await graphClient.updateServiceMetrics(component.id, ComponentStatus.NORMAL);
  }

  if (!serviceHasAnError) {
    return;
  }

  const serviceIsStillAnomalous = isServiceAnomalous(component.status) && serviceHasAnError;

  if (serviceIsStillAnomalous) {
    return;
  }

  // TODO: Add external alert
  // const errorMessages = mapValues(
  //   errorsByMetric,
  //   (metricHasError: boolean, metricKey: string): string =>
  //     metricHasError &&
  //     getMetricErrorMessage(
  //       MetricTypes[metricKey],
  //       component.metrics[metricKey],
  //       serviceThresholds[metricKey],
  //       serviceValue.callee
  //     )
  // );

  await graphClient.updateServiceMetrics(component.id, ComponentStatus.CONFIRMED);
}

async function onEveryMessage({
  partition,
  message
}: {
  partition: any;
  message: DependencyDetectionMessage;
}): Promise<void> {
  logger.info(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const componentCalls: ComponentCall[] = message.value;

  await Promise.all(componentCalls.map(processComponentCall));
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

function isServiceAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}

function getMetricErrorMessage(type: MetricTypes, value: number, threshold: number, serviceName: string): string {
  return `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value is ${threshold} and the current value is ${value}`;
}
