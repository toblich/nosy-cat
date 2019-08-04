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

export { ping };
