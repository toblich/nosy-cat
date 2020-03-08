import { Producer, logger, kafkaWrapper } from "helpers";

const onEachMessageFactory = (
  producer: Producer,
  onEachMessage: (...args: any) => Promise<void>
): ((...args: any) => Promise<void>) => (...args: any): Promise<void> => onEachMessage(producer, args);

export async function consume(
  tracer: any, // this is a zipkin tracer
  topic: string,
  onEachMessage: (producer: Producer, arg: any) => Promise<void>
): Promise<void> {
  logger.debug("entered consume");

  try {
    const kafka = await kafkaWrapper(tracer, "pager-duty-integration");

    const consumer = kafka.consumer;
    const producer = kafka.producer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessageFactory(producer, onEachMessage)
    });
  } catch (err) {
    logger.error(err);
  }
}
