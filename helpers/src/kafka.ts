import * as kafka from "kafka-node";
import * as bluebird from "bluebird";

const Producer = kafka.Producer;
const client = new kafka.KafkaClient({ kafkaHost: "localhost:9092" });
const producer = new Producer(client, { requireAcks: 1 });

const sendAsync = bluebird.promisify(producer.send);
const createTopicsAsync = bluebird.promisify(client.createTopics);

export { sendAsync, createTopicsAsync, producer };
