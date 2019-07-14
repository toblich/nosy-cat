import * as kafka from "kafka-node";
import * as bluebird from "bluebird";

const client = new kafka.KafkaClient();
const producer = new kafka.Producer(client);
const sendAsync = bluebird.promisify(producer.send);

const createTopicsAsync = bluebird.promisify(client.createTopics);

export { sendAsync, createTopicsAsync };
