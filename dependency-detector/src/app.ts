import { consume } from "./kafka-integration";
import {
  logger,
  createZipkinContextTracer,
  ZipkinSpan,
  ComponentCall,
  IngressMessage,
  GraphClient,
  Producer
} from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

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

async function onEachMessage(producer: Producer, args: any): Promise<void> {
  const [{ partition, message }] = args;
  logger.info(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.info(`value ${JSON.stringify(value)}`);
  const componentCalls: ComponentCall[] = registerDependencies(value);
  logger.info(`componentCalls ${JSON.stringify(componentCalls)}`);

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
