import * as Pulsar from "pulsar-client";

const pulsar = (): Pulsar.Client => {
  return new Pulsar.Client({
    serviceUrl: `pulsar://${process.env.PULSAR || "localhost:6650"}`,
    operationTimeoutSeconds: 30
  });
};

export interface PulsarProducer {
  send: (body: any) => undefined;
  flush: () => Promise<void>;
  close: () => Promise<void>;
}

const getPulsarProducer = async (topic: string): Promise<PulsarProducer> => {
  const client = pulsar();

  const producer = await client.createProducer({
    topic,
    sendTimeoutMs: 30000,
    batchingEnabled: true
  });

  return producer;
};

export { getPulsarProducer };
