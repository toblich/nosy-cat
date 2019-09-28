import { consume } from "./kafka-integration";

import {
  logger,
  createZipkinContextTracer,
  DependencyDetectionMessage,
  GraphClient,
  ServiceStatus,
  ComponentCall
} from "helpers";
import thresholds from "./thresholds";
import { MetricTypes } from "./types";
import { capitalize, mapValues } from "lodash";

const { tracer } = createZipkinContextTracer("anomaly-detector");

consume(tracer, "dependency-detector", onEveryMessage);

const graphClient = new GraphClient(`http://localhost:${process.env.GRAPH_PORT || 6000}`);

// ---

async function processComponentCall(serviceValue: ComponentCall): Promise<void> {
  const service = await graphClient.getService(serviceValue.callee);

  const serviceThresholds = {
    errorRate: getServiceThreshold(serviceValue, MetricTypes.errorRate),
    responseTime: getServiceThreshold(serviceValue, MetricTypes.responseTime),
    throughput: getServiceThreshold(serviceValue, MetricTypes.throughput)
  };

  if (isServiceAnomalous(service.body)) {
    return checkIfServiceIsBackToNormal();
  }

  const errorsByMetric = mapValues(serviceThresholds, (_: any, metricKey: string): boolean =>
    metricHasAnomaly(serviceThresholds[metricKey], 1)
  );

  const hasError = Object.keys(errorsByMetric).some((metricKey: string) => errorsByMetric[metricKey]);

  if (!hasError) {
    return;
  }

  const errorMessages = mapValues(
    errorsByMetric,
    (metricHasError: boolean, metricKey: string): string =>
      metricHasError &&
      getMetricErrorMessage(MetricTypes[metricKey], 1, serviceThresholds[metricKey], (service as any).name)
  );
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

  const promises = componentCalls.map(processComponentCall);

  await Promise.all(promises);
}

function checkIfServiceIsBackToNormal(): void {
  return;
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

function isServiceAnomalous(serviceStatus: ServiceStatus): boolean {
  return [ServiceStatus.CONFIRMED, ServiceStatus.PERPETRATOR, ServiceStatus.VICTIM].includes(serviceStatus);
}

function getMetricErrorMessage(type: MetricTypes, value: number, threshold: number, serviceName: string): string {
  return `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value is ${threshold} and the current value is ${value}`;
}
