import * as Kafka from "kafkajs";
import { Tracer } from "zipkin";
import instrumentKafkaJs = require("zipkin-instrumentation-kafkajs");

const kafka = (tracer: Tracer): Kafka.Kafka => {
  return instrumentKafkaJs(
    new Kafka.Kafka({
      brokers: ["localhost:9092"]
    }),
    {
      tracer,
      remoteServiceName: "kafka"
    }
  );
};

interface KafkaWrapper {
  producer: Kafka.Producer;
  consumer: Kafka.Consumer;
}

const kafkaWrapper = async (tracer: Tracer, groupId: string): Promise<KafkaWrapper> => {
  const kafkaInstance = kafka(tracer);
  const producer = kafkaInstance.producer();
  const consumer = kafkaInstance.consumer({ groupId });

  await producer.connect();
  await consumer.connect();

  return {
    producer,
    consumer
  };
};

export { kafkaWrapper };
