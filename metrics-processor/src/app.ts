import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentHistoricMetrics, Producer } from "helpers";
import { processRequest } from "./metrics";
import InfluxRepository from "./influxRepository";

const { tracer } = createZipkinContextTracer("metrics-processor");

if (!process.env.REDIS_HOST) {
  throw Error("Missing Redis Host value");
}

const influxRepository = new InfluxRepository();
consume(tracer, "ingress", onEachMessage);

// ---

async function processSpan(span: ZipkinSpan): Promise<ComponentHistoricMetrics | null> {
  logger.debug(`processing span ${JSON.stringify(span, null, 4)}`);
  const errored = hasErrored(span);
  const remoteEndpointName = (span.remoteEndpoint && span.remoteEndpoint.serviceName) || undefined;
  const localEndpointName = (span.localEndpoint && span.localEndpoint.serviceName) || undefined;
  const metrics = {
    duration: span.duration,
    errored,
    timestamp: span.timestamp,
  };

  const component = span.kind === "SERVER" ? localEndpointName : remoteEndpointName;

  const processedMetrics = await processRequest({ component, ...metrics });
  if (!processedMetrics || processedMetrics.length === 0) {
    logger.debug(`There are no resulting processed metrics for component ${component}`);
    return null;
  }

  return { component, metrics: processedMetrics };
}

async function processSpans(value: ZipkinSpan[] | ZipkinSpan): Promise<ComponentHistoricMetrics[]> {
  const valuesArray = Array.isArray(value) ? value : [value];
  const results = await Promise.all(valuesArray.map(processSpan));
  return results.filter((c: ComponentHistoricMetrics | null) => c);
}

async function onEachMessage(producer: Producer, args: any): Promise<void> {
  const [{ partition, message }] = args;
  logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.debug(`value ${JSON.stringify(value)}`);
  const componentHistoricMetrics = await processSpans(value);

  if (componentHistoricMetrics.length === 0) {
    // if there are no new values, just do nothing
    logger.info("Not posting anything, as there is no relevant info");
    return;
  }

  logger.info(`Writing metrics to Influx: ${JSON.stringify(componentHistoricMetrics, null, 4)}`);
  influxRepository.writeBatch(componentHistoricMetrics);

  logger.info(`Posting message to Kafka: ${JSON.stringify(componentHistoricMetrics, null, 4)}`);

  try {
    await producer.send({
      topic: "metrics-processor",
      messages: [
        {
          value: JSON.stringify(componentHistoricMetrics),
        },
      ],
    });
  } catch (error) {
    logger.error(error);
  }
}

function hasErrored(span: ZipkinSpan): boolean {
  if (span.tags && span.tags["http.status_code"]) {
    return span.tags["http.status_code"] >= 400;
  }

  return false;
}
