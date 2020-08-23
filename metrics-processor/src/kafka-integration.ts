import { kafkaWrapper, logger, Producer } from "helpers";
import { Tracer } from "zipkin";

const onEachMessageFactory = (
  producer: Producer,
  onEachMessage: (...args: any) => Promise<void>
): ((...args: any) => Promise<void>) => (...args: any): Promise<void> => onEachMessage(producer, args);

export async function consume(
  tracer: Tracer,
  topic: string,
  onEachMessage: (producer: Producer, arg: any) => Promise<void>
): Promise<void> {
  logger.debug("entered consume");

  try {
    const kafka = await kafkaWrapper(tracer, "dependency-detector");

    const consumer = kafka.consumer;
    const producer = kafka.producer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessageFactory(producer, onEachMessage),
    });
  } catch (err) {
    logger.error(err);
  }
}
