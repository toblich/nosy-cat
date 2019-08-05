import { logger } from "helpers";
import { Producer } from "kafkajs";

const ping = async (producer: Producer) => {
  logger.info("entered ping");

  try {
    logger.info("seding payload");

    const data = await producer.send({ acks: 1, topic: "test", messages: [{ value: "hi" }] });
    logger.info("sent payload, data is:", data);
  } catch (error) {
    logger.error("couldn't send payload", error);
  }
};

const spans = async (producer: Producer, body: any) => {
  try {
    logger.info(`new message ${JSON.stringify(body)}`);

    await producer.send({ acks: 1, topic: "ingress", messages: [{ value: JSON.stringify(body) }] });
    logger.info("sent message");
  } catch (error) {
    logger.error("couldn't send message", error);
  }
};

export { ping, spans };
