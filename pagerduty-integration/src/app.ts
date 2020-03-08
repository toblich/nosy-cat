import { logger, createZipkinContextTracer, Producer, Alert } from "helpers";
import { consume } from "./kafka-integration";

import * as superagent from "superagent";

const tracer = createZipkinContextTracer("pager-duty-integration");

async function processError(error: Alert): Promise<void> {
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

async function onEachMessage(producer: Producer, args: any): Promise<void> {
  const [{ partition, message }] = args;
  logger.debug(JSON.stringify({ partition, offset: message.offset, value: message.value.toString() }));

  const value = JSON.parse(message.value.toString());

  logger.debug(`value ${JSON.stringify(value)}`);
  if (Array.isArray(value)) {
    await Promise.all(value.map((error: Alert) => processError(error)));
  } else {
    await processError(value);
  }
}

consume(tracer, "alerts", onEachMessage);
