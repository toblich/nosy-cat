import { kafkaWrapper, logger } from "helpers";
import { Tracer } from "zipkin";
import { getPulsarProducer, PulsarProducer } from "./pulsar";

const onEachMessageFactory = (
  producer: PulsarProducer,
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

    const pulsarProducer = await getPulsarProducer("component-alerts");

    const consumer = await kafka.consumer;

    logger.debug(`subscribing to topic "${topic}"`);

    await consumer.subscribe({ topic });

    logger.debug(`processing messages from topic "${topic}"...`);

    await consumer.run({
      eachMessage: onEachMessageFactory(pulsarProducer, onEachMessage)
    });
  } catch (err) {
    logger.error(err);
  }
}
