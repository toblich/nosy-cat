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

const kafkaWrapper = (tracer: Tracer) => {
  const kafkaInstance = kafka(tracer);

  return {
    producer: kafkaInstance.producer(),
    consumer: kafkaInstance.consumer()
  };
};

export { kafkaWrapper };
