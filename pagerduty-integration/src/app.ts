import { getPulsarConsumer } from "./pulsar";
import { logger } from "helpers";

import * as superagent from "superagent";

let shouldContinue = true;
process.on("SIGINT", () => {
  shouldContinue = false;
});

(async (): Promise<void> => {
  const consumer = await getPulsarConsumer("component-alerts");

  while (shouldContinue) {
    const messageList = await consumer.receive();
    consumer.acknowledge(messageList);
    logger.data(`Got Pulsar message: ${messageList.getData()}`);

    const msg = JSON.parse(messageList.getData());
    logger.debug("msg", msg);
    const { errorRate, meanResponseTimeMs, throughput } = msg;
    const error = errorRate || meanResponseTimeMs || throughput;

    const { type, serviceName, expected, value, message } = error;
    try {
      // https://v2.developer.pagerduty.com/docs/send-an-event-events-api-v2
      // "https://events.pagerduty.com/v2/enqueue"
      const res = await superagent.post("https://events.pagerduty.com/v2/enqueue").send({
        routing_key: "be668202a42249618411b6a507ca3c7a",
        event_action: "trigger",
        payload: {
          summary: `${serviceName} ${type} ${value} <> ${expected}`,
          source: serviceName,
          severity: "critical",
          // timestamp: Date.now(),
          component: serviceName,
          class: type,
          custom_details: {
            description: message
          }
        }
      });
      logger.info(`PagerDuty responded with: ${res.status} ${JSON.stringify(res.body, null, 4)}`);
    } catch (e) {
      logger.error(`PagerDuty Error: ${e.message} ${JSON.stringify(e, null, 4)}`);
    }
  }

  await consumer.shutdown();
})();
