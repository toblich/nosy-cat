import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, Producer } from "helpers";
import { processRequest } from "./metrics";

const { tracer } = createZipkinContextTracer("metrics-processor");

if (!process.env.REDIS_HOST) {
  throw Error("Missing Redis Host value");
}

consume(tracer, "ingress", onEachMessage);

// ---

async function processSpan(span: ZipkinSpan): Promise<ComponentCall> {
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

  await processRequest({ component, ...metrics });

  // TODO this should no longer return these ComponentCalls
  // TODO It should return the set of EWMA + EWMAStdDev + Observation values
  if (span.kind === "SERVER") {
    return {
      callee: localEndpointName,
      caller: remoteEndpointName,
      metrics,
    };
  }

  return {
    callee: remoteEndpointName,
    caller: localEndpointName,
    metrics,
  };
}

async function processSpans(value: ZipkinSpan[] | ZipkinSpan): Promise<ComponentCall[]> {
  if (Array.isArray(value)) {
    return Promise.all(value.map(processSpan));
  }

  return Promise.all([processSpan(value)]);
}

async function onEachMessage(producer: Producer, args: any): Promise<void> {
  const [{ partition, message }] = args;
  logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.debug(`value ${JSON.stringify(value)}`);
  const componentCalls = await processSpans(value);

  logger.debug(`componentCalls ${JSON.stringify(componentCalls)}`);

  try {
    await producer.send({
      topic: "metrics-processor",
      messages: [
        {
          value: JSON.stringify(componentCalls),
        },
      ],
    });
  } catch (error) {
    logger.error(error);
  }
}

function hasErrored(span: ZipkinSpan): boolean {
  if (span.tags && span.tags["http.status_code"]) {
    return span.tags["http.status_code"] > 400;
  }

  return false;
}
