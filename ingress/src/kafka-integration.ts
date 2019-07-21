import { logger, sendAsync } from "helpers";
import { ProduceRequest } from "kafka-node";

const payloads: ProduceRequest[] = [{ topic: "test-4", messages: ["test message"] }];

const ping = async () => {
  logger.info("entered ping");

  try {
    logger.info("seding payload");

    const data = await sendAsync(payloads);
    logger.info("sent payload, data is:", data);
  } catch (error) {
    logger.error("couldn't send payload", error);
  }
};

export { ping };
