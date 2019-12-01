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
    const message = await consumer.receive();
    consumer.acknowledge(message);
    logger.info(message.getData());

    try {
      const res = await superagent.post("https://events.pagerduty.com/v2/enqueue").send({
        routing_key: "6e05660959644cedabd1afb3c8abf8b8",
        event_action: "trigger",
        payload: {
          summary: "Test incident!",
          source: "Test source!",
          severity: "critical",
          // timestamp: Date.now(),
          component: "Test component!",
          class: "test class"
        }
      });
      logger.info(`${res.status} ${JSON.stringify(res.body, null, 4)}`);
    } catch (e) {
      logger.error(e.message + JSON.stringify(e.body, null, 4));
    }
  }

  /*
routing_key:
required
string
This is the 32 character Integration Key for an integration on a service or on a global ruleset.

event_action:
required
stringtrigger
The type of event. Can be trigger, acknowledge or resolve. See Event Action.

dedup_key:	string
Deduplication key for correlating triggers and resolves. The maximum permitted length of this property is 255 characters.

payload.summary:
required
string
A brief text summary of the event, used to generate the summaries/titles of any associated alerts. The maximum permitted length of this property is 1024 characters.

payload.source:
required
string
The unique location of the affected system, preferably a hostname or FQDN.

payload.severity:
required
string
The perceived severity of the status the event is describing with respect to the affected system. This can be critical, error, warning or info.

payload.timestamp:	timestamp
The time at which the emitting tool detected or generated the event.

payload.component:	string
Component of the source machine that is responsible for the event, for example mysql or eth0

payload.group:	string
Logical grouping of components of a service, for example app-stack

payload.class:	string
The class/type of the event, for example ping failure or cpu load

payload.custom_details:	object
Additional details about the event and affected system

images:	array of objects
List of images to include.

links:	array of objects
List of links to include.
  */

  await consumer.shutdown();
})();
