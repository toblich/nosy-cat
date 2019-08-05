import { kafkaWrapper, logger } from "helpers";
import { Tracer } from "zipkin";

export async function consume(tracer: Tracer, topic: string, onEachMessage: (arg: any) => Promise<void>) {
  logger.debug("entered consume");

  try {
    const kafka = await kafkaWrapper(tracer);

    const consumer = await kafka.consumer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessage
    });
  } catch (err) {
    logger.error(err);
  }
}
