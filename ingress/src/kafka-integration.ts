import { sendAsync, producer } from "helpers";
import { ProduceRequest } from "kafka-node";

const ping = () => {
  const payloads: ProduceRequest[] = [{ topic: "test", messages: ["test message"] }];

  producer.on("ready", async () => {
    try {
      const data = await sendAsync(payloads);

      // tslint:disable-next-line:no-console
      console.log("data", data);
    } catch (error) {
      // tslint:disable-next-line:no-console
      console.error("error", error);
    }
  });

  producer.on("error", error => {
    // tslint:disable-next-line:no-console
    console.error("producer error", error);
  });
};

export { ping };
