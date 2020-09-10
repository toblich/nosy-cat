import { consume } from "./kafka-integration";

import {
  logger,
  createZipkinContextTracer,
  DependencyDetectionMessage,
  generateGraphClient,
  ComponentStatus,
  Producer,
  MetricTypes,
  ComponentHistoricMetrics,
  HistoricMetric,
} from "helpers";
import { Range } from "./types";
import { capitalize, mapValues } from "lodash";

const { tracer } = createZipkinContextTracer("anomaly-detector");

consume(tracer, "metrics-processor", onEveryMessage);

if (!process.env.GRAPH_PORT || !process.env.GRAPH_HOST) {
  throw Error("Missing Graph host values");
}

const graphClient = generateGraphClient(`http://${process.env.GRAPH_HOST}:${process.env.GRAPH_PORT}`);

// ---

const ACCEPTED_STD_DEVIATIONS = 3;

export async function processComponentCall(
  producer: Producer,
  componentMetrics: ComponentHistoricMetrics
): Promise<void> {
  logger.debug(`componentMetrics: ${JSON.stringify(componentMetrics, null, 2)}`);

  const componentId = componentMetrics.component;
  const component = (await graphClient.getService(componentId)).body; // TODO replace with direct Neo4J Cipher query
  logger.debug(`component: ${JSON.stringify(component, null, 2)}`);

  const errorMessages = componentMetrics.metrics
    .map((metric: HistoricMetric) => {
      const thresholds: Range = {
        minimum: metric.historicAvg - ACCEPTED_STD_DEVIATIONS * metric.historicStdDev,
        maximum: metric.historicAvg + ACCEPTED_STD_DEVIATIONS * metric.historicStdDev,
      };

      logger.debug(`thresholds (${metric.name}): ${JSON.stringify(thresholds, null, 2)}`);

      return metricHasAnomaly(thresholds, metric.latest)
        ? getMetricErrorMessage(
            MetricTypes[metric.name],
            metric.latest,
            thresholds.maximum,
            thresholds.minimum,
            componentId
          )
        : null;
    })
    .filter(Boolean);

  const hasErrored = errorMessages.length > 0;

  logger.debug(`hasErrored: ${hasErrored}`);
  logger.debug(`errorMessages: ${JSON.stringify(errorMessages, null, 2)}`);

  const serviceIsBackToNormal = wasServiceAnomalous(component.status) && !hasErrored;
  logger.debug(`serviceIsBackToNormal: ${serviceIsBackToNormal}`);

  if (serviceIsBackToNormal) {
    await graphClient.updateServiceMetrics(component.id, ComponentStatus.NORMAL);
  }

  if (!hasErrored) {
    return;
  }

  const serviceIsStillAnomalous = wasServiceAnomalous(component.status) && hasErrored;

  if (serviceIsStillAnomalous) {
    return;
  }

  const response = (await graphClient.updateServiceMetrics(component.id, ComponentStatus.CONFIRMED)).body; // TODO replace with direct Neo4J Cipher query
  const newServiceStatus = response[component.id] && response[component.id].to.status;
  if (newServiceStatus === ComponentStatus.PERPETRATOR) {
    await producer.send({
      topic: "alerts",
      messages: [
        {
          value: JSON.stringify(errorMessages),
        },
      ],
    });
  }
}

interface Entry {
  partition: any;
  message: DependencyDetectionMessage;
}

async function onEveryMessage(producer: Producer, entries: Entry[]): Promise<void> {
  const processMessages = entries.map(async (entry: Entry) => {
    const { partition, message } = entry;

    try {
      logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

      const componentHistoricMetrics: ComponentHistoricMetrics[] = JSON.parse(message.value.toString());

      await Promise.all(
        componentHistoricMetrics.map((c: ComponentHistoricMetrics) => processComponentCall(producer, c))
      );
    } catch (error) {
      logger.error(`Error processing an entry: ${error}`);
      logger.data(`The entry was: ${JSON.stringify(entry)}`);
    }
  });

  await Promise.all(processMessages);
}

function metricHasAnomaly(threshold: Range, value: number): boolean {
  return value < threshold.minimum || value > threshold.maximum;
}

function wasServiceAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}

function getMetricErrorMessage(
  type: MetricTypes,
  value: number,
  maximum: number,
  minimum: number,
  serviceName: string
): any {
  const message = `The service ${serviceName} is presenting an anomaly with the ${capitalize(
    type
  )}, the expected value should be between ${JSON.stringify(minimum)} and ${JSON.stringify(
    maximum
  )} and the current value is ${value}`;

  return {
    serviceName,
    type,
    minimum,
    maximum,
    value,
    message,
  };
}
