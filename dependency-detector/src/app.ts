import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, IngressMessage, GraphClient } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

consume(tracer, "ingress", onEveryMessage);

const graphClient = new GraphClient(`http://localhost:${process.env.GRAPH_PORT || 6000}`);

// ---

const processSpan = (span: ZipkinSpan): ComponentCall => ({
  callee: (span.localEndpoint && span.localEndpoint.serviceName) || undefined,
  caller: (span.remoteEndpoint && span.remoteEndpoint.serviceName) || undefined
});

function registerDependencies(value: ZipkinSpan[] | ZipkinSpan): ComponentCall[] {
  if (Array.isArray(value)) {
    return value.map(processSpan);
  }

  return [processSpan(value)];
}

async function onEveryMessage({ partition, message }: { partition: any; message: IngressMessage }): Promise<void> {
  logger.info(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.info(`value ${JSON.stringify(value)}`);
  const componentCalls: ComponentCall[] = registerDependencies(value);
  logger.info(`componentCalls ${JSON.stringify(componentCalls)}`);

  try {
    await graphClient.postComponentCalls(componentCalls);
  } catch (error) {
    logger.error(error);
  }
}
