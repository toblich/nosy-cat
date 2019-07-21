import * as kafka from "kafka-node";
import { promisify } from "util";
import * as bluebird from "bluebird";
import { logger } from "./logger";

const client = new kafka.KafkaClient({ kafkaHost: "localhost:9092" });
const producer = new kafka.Producer(client, { requireAcks: 1 });

client.on("ready", () => {
  logger.info("client ready");
});

client.on("error", err => {
  logger.error("client error: " + err);
});

const sendAsync = bluebird.promisify(producer.send, { context: producer });
const createTopicsAsync = bluebird.promisify(client.createTopics);

export { sendAsync, createTopicsAsync, producer };
