import { consume } from "./kafka-integration";
import { logger, createZipkinContextTracer } from "helpers";

const { tracer } = createZipkinContextTracer("dependency-detector");

consume(tracer, "test", onEveryMessage);

// ---

async function onEveryMessage({ partition, message }) {
  logger.info(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));
}
