import * as Pulsar from "pulsar-client";

const pulsar = (): Pulsar.Client => {
  return new Pulsar.Client({
    serviceUrl: `pulsar://${process.env.PULSAR || "localhost:6650"}`,
    operationTimeoutSeconds: 30
  });
};

export interface PulsarMessage {
  getData: () => any;
  getProperties: () => any;
  getMessageId: () => any;
  getEventTimestamp: () => any;
  getPublishTimestamp: () => any;
}

export interface PulsarConsumer {
  receive: () => Promise<PulsarMessage>;
  acknowledge: (msg: PulsarMessage) => void;
  shutdown: () => Promise<void>;
}

const getPulsarConsumer = async (topic: string): Promise<PulsarConsumer> => {
  const client = pulsar();

  // Create a consumer
  const consumer = await client.subscribe({
    topic,
    subscription: "pagerduty-integration",
    subscriptionType: "Shared",
    ackTimeoutMs: 10000
  });

  consumer.shutdown = async (): Promise<void> => {
    await consumer.close();
    await client.close();
  };

  return consumer;
};

export { getPulsarConsumer };
