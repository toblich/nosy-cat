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

const kafkaWrapper = async (tracer: Tracer) => {
  const kafkaInstance = kafka(tracer);
  const producer = kafkaInstance.producer();
  const consumer = kafkaInstance.consumer();

  await producer.connect();
  await consumer.connect();

  return {
    producer,
    consumer
  };
};

export { kafkaWrapper };
