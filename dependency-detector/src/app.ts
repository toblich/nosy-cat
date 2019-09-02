import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer, ZipkinSpan, ComponentCall, Message, GraphClient } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

consume(tracer, "ingress", onEveryMessage);

const graphClient = new GraphClient("http://localhost:4000");

// ---

const processSpan = (span: ZipkinSpan): ComponentCall => ({
  callee: span.localEndpoint.serviceName,
  caller: (span.remoteEndpoint && span.remoteEndpoint.serviceName) || undefined
});

function checkDependency(span: ZipkinSpan): ComponentCall[] {
  return [processSpan(span)];
}

function checkBulkDependencies(spans: ZipkinSpan[]): ComponentCall[] {
  return spans.map(processSpan);
}

async function onEveryMessage({ partition, message }: { partition: any; message: Message }): void {
  logger.info(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  let componentCalls: ComponentCall[];

  if (Array.isArray(message.value)) {
    componentCalls = checkBulkDependencies(message.value);
  } else {
    componentCalls = checkDependency(message.value);
  }

  await graphClient.postComponentCalls(componentCalls);
}
