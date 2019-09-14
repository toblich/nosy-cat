import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, IngressMessage, GraphClient } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

consume(tracer, "ingress", onEveryMessage);

const graphClient = new GraphClient("http://localhost:4000");

// ---

const processSpan = (span: ZipkinSpan): ComponentCall => ({
  callee: span.localEndpoint.serviceName,
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

  const componentCalls: ComponentCall[] = registerDependencies(message.value);

  await graphClient.postComponentCalls(componentCalls);
}
