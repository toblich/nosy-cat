import { logger } from "helpers";
import { Producer } from "kafkajs";

// tslint:disable-next-line:typedef
const spans = async (producer: Producer, body: any) => {
  try {
    logger.info(`new message ${JSON.stringify(body)}`);

    await producer.send({ topic: "ingress", messages: [{ value: JSON.stringify(body) }] });
    logger.info("sent message");
  } catch (error) {
    logger.error("couldn't send message", error);
  }
};

export { spans };
