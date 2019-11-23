import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, generateGraphClient, Producer } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

const graphClient = generateGraphClient(
  `http://${process.env.GRAPH_HOST || "localhost"}:${process.env.GRAPH_PORT || 4000}`
);

// ---

function hasErrored(span: ZipkinSpan): boolean {
  if (span.tags && span.tags["http.status_code"]) {
    return span.tags["http.status_code"] > 400;
  }

  return false;
}

const processSpan = (span: ZipkinSpan): ComponentCall => {
  const errored = hasErrored(span);
  // TODO: Review kind Server/Client to avoid duplicate metrics
  return {
    callee: (span.localEndpoint && span.localEndpoint.serviceName) || undefined,
    caller: (span.remoteEndpoint && span.remoteEndpoint.serviceName) || undefined,
    metrics: {
      duration: span.duration,
      errored,
      timestamp: span.timestamp
    }
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
    await producer.send({
      topic: "dependency-detector",
      messages: [
        {
          value: JSON.stringify(componentCalls)
        }
      ]
    });
  } catch (error) {
    logger.error(error);
  }
}

consume(tracer, "ingress", onEachMessage);
