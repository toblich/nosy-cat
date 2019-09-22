import { kafkaWrapper, logger, Producer } from "helpers";
import { Tracer } from "zipkin";

export async function consume(
  tracer: Tracer,
  topic: string,
  onEachMessage: (producer: Producer) => (arg: any) => Promise<void>
): Promise<void> {
  logger.debug("entered consume");

  try {
    const kafka = await kafkaWrapper(tracer, "dependency-detector");

    const consumer = await kafka.consumer;
    const producer = await kafka.producer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessage(producer)
    });
  } catch (err) {
    logger.error(err);
  }
}
