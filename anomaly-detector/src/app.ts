import { consume } from "./kafka-integration";

import {
  logger,
  createZipkinContextTracer,
  DependencyDetectionMessage,
  GraphClient,
  ComponentStatus,
  ComponentCall,
  Component,
  ComponentMetrics,
  Dictionary
} from "helpers";
import thresholds from "./thresholds";
import { MetricTypes } from "./types";
import { capitalize, mapValues } from "lodash";

const { tracer } = createZipkinContextTracer("anomaly-detector");

consume(tracer, "dependency-detector", onEveryMessage);

const graphClient = new GraphClient(`http://localhost:${process.env.GRAPH_PORT || 6000}`);

// ---

function getErrorsByMetric(serviceThresholds: ComponentMetrics, service: Component): Dictionary<boolean> {
  return mapValues(serviceThresholds, (_: any, metricKey: string): boolean =>
    metricHasAnomaly(serviceThresholds[metricKey], service.metrics[metricKey])
  );
}

async function processComponentCall(serviceValue: ComponentCall): Promise<void> {
  const component = (await graphClient.getService(serviceValue.callee)).body;

  const serviceThresholds: ComponentMetrics = {
    errorRate: getServiceThreshold(serviceValue, MetricTypes.errorRate),
    meanResponseTimeMs: getServiceThreshold(serviceValue, MetricTypes.responseTime),
    throughput: getServiceThreshold(serviceValue, MetricTypes.throughput)
  };

  const errorsByMetric = getErrorsByMetric(serviceThresholds, component);

  const serviceHasAnError = Object.keys(errorsByMetric).some((metricKey: string) => errorsByMetric[metricKey]);

  const serviceIsBackToNormal = isServiceAnomalous(component.status) && !serviceHasAnError;

  if (serviceIsBackToNormal) {
    await graphClient.updateServiceMetrics(component.id, ComponentStatus.NORMAL);
    return;
  }

  if (!serviceHasAnError) {
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

function getServiceThreshold(value: ComponentCall, type: MetricTypes): number {
  if (!thresholds[value.callee]) {
    thresholds[value.callee] = {
      errorRate: 0.5,
      responseTime: 1000,
      throughput: 1
    };
  }

  return thresholds[value.callee][type];
}

function metricHasAnomaly(threshold: number, value: number): boolean {
  return value > threshold;
}

function isServiceAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}

function getMetricErrorMessage(type: MetricTypes, value: number, threshold: number, serviceName: string): string {
  return `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value is ${threshold} and the current value is ${value}`;
}
