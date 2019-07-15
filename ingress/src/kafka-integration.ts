import { ProduceRequest } from "kafka-node";
import { sendAsync } from "@helpers/promisifed-kafka";

const ping = async () => {
  const payloads: ProduceRequest[] = [{ topic: "test", messages: ["test message"] }];

  try {
    const data = await sendAsync(payloads);

    // tslint:disable-next-line:no-console
    console.log("data", data);
  } catch (error) {
    // tslint:disable-next-line:no-console
    console.error("error", error);
  }
};

export { ping };
