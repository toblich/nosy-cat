import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, generateGraphClient, Producer } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

if (!process.env.GRAPH_PORT || !process.env.GRAPH_HOST) {
  throw Error("Missing Dependency detector Host values");
}

const graphClient = generateGraphClient(`http://${process.env.GRAPH_HOST || "localhost"}:${process.env.GRAPH_PORT}`);

// ---

function hasErrored(span: ZipkinSpan): boolean {
  if (span.tags && span.tags["http.status_code"]) {
    return span.tags["http.status_code"] > 400;
  }

  return false;
}

const processSpan = (span: ZipkinSpan): ComponentCall => {
  const errored = hasErrored(span);
  const remoteEndpointName = (span.remoteEndpoint && span.remoteEndpoint.serviceName) || undefined;
  const localEndpointName = (span.localEndpoint && span.localEndpoint.serviceName) || undefined;
  const metrics = {
    duration: span.duration,
    errored,
    timestamp: span.timestamp,
  };

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
};

function registerDependencies(value: ZipkinSpan[] | ZipkinSpan): ComponentCall[] {
  if (Array.isArray(value)) {
    return value.map(processSpan);
  }

  return [processSpan(value)];
}

async function onEachMessage(producer: Producer, args: any): Promise<void> {
  const [{ partition, message }] = args;
  logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.debug(`value ${JSON.stringify(value)}`);
  const componentCalls = registerDependencies(value);

  logger.debug(`componentCalls ${JSON.stringify(componentCalls)}`);

  try {
    await graphClient.postComponentCalls(componentCalls);
  } catch (error) {
    logger.error(error);
  }
}

consume(tracer, "ingress", onEachMessage);
