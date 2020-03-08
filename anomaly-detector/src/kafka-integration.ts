import { kafkaWrapper, logger, Producer } from "helpers";
import { Tracer } from "zipkin";

const onEachMessageFactory = (
  producer: Producer,
  onEachMessage: (...args: any) => Promise<void>
): ((...args: any) => Promise<void>) => (...args: any): Promise<void> => {
  logger.debug(`producer ${producer}`);
  logger.debug(`typeof producer ${typeof producer}`);
  logger.debug(`args ${JSON.stringify(args)}`);
  return onEachMessage(producer, args);
};

export async function consume(
  tracer: Tracer,
  topic: string,
  onEachMessage: (...args: any) => Promise<void>
): Promise<void> {
  logger.debug("entered consume");

  try {
    const kafka = await kafkaWrapper(tracer, "anomaly-detector");

    const kafkaProducer = kafka.producer;

    const consumer = await kafka.consumer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessageFactory(kafkaProducer, onEachMessage)
    });
  } catch (err) {
    logger.error(err);
  }
}
