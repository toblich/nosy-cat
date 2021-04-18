import { BatchRecorder, jsonEncoder as JSONEncoder } from "zipkin";
import * as fetch from "node-fetch";

// Send spans to Zipkin asynchronously over HTTP
const INGRESS_HOST = process.env.INGRESS_HOST;
const INGRESS_PORT = process.env.INGRESS_PORT;

if (!INGRESS_HOST || !INGRESS_PORT) {
  throw Error("Missing ingress host values");
}
const zipkinBaseUrl = `http://${INGRESS_HOST}:${INGRESS_PORT}`;

// tslint:disable-next-line:no-var-requires
const EventEmitter = require("events").EventEmitter;

class MyLogger extends EventEmitter {
  private queue: any[];
  private endpoint: any;
  private jsonEncoder: any;
  private errorListenerSet: boolean;
  private headers: Record<string, any>;
  private timeout: number;

  public time;
  constructor({ endpoint, headers = {}, httpInterval = 1000, jsonEncoder = JSONEncoder.JSON_V2, timeout = 0 }: any) {
    super(); // must be before any reference to *this*
    this.endpoint = endpoint;
    this.queue = [];
    this.jsonEncoder = jsonEncoder;

    this.errorListenerSet = false;

    this.headers = Object.assign(
      {
        "Content-Type": "application/json",
      },
      headers
    );

    // req/res timeout in ms, it resets on redirect. 0 to disable (OS limit applies)
    // only supported by node-fetch; silently ignored by browser fetch clients
    // @see https://github.com/bitinn/node-fetch#fetch-options
    this.timeout = timeout;

    const timer = setInterval(() => {
      this.processQueue();
    }, httpInterval);
    if (timer.unref) {
      // unref might not be available in browsers
      timer.unref(); // Allows Node to terminate instead of blocking on timer
    }
  }

  public on(...args: any[]): void {
    const eventName = args[0];
    // if the instance has an error handler set then we don't need to
    // console.log errors anymore
    if (eventName.toLowerCase() === "error") {
      this.errorListenerSet = true;
    }
    super.on.apply(this, args);
  }

  // tslint:disable-next-line:typedef
  public logSpan(span): void {
    this.queue.push(this.jsonEncoder.encode(span));
    // tslint:disable-next-line:no-console
    console.log("span", span);
  }

  public processQueue(): Promise<void> {
    const self = this;
    if (self.queue.length > 0) {
      const postBody = `[${self.queue.join(",")}]`;
      const promise = fetch(self.endpoint, {
        method: "POST",
        body: postBody,
        headers: self.headers,
        timeout: self.timeout,
      })
        .then((response: { status: number; body: any }): void => {
          if (response.status !== 202 && response.status !== 200) {
            const err =
              "Unexpected response while sending Zipkin data, status:" + `${response.status}, body: ${postBody}`;

            if (self.errorListenerSet) {
              this.emit("error", new Error(err));
            } else {
              // tslint:disable-next-line:no-console
              console.error(err);
            }
          } else {
            this.emit("success", response);
          }
        })
        .catch((error: string) => {
          const err = `Error sending Zipkin data ${error}`;
          if (self.errorListenerSet) {
            this.emit("error", new Error(err));
          } else {
            // tslint:disable-next-line:no-console
            console.error(err);
          }
        });
      self.queue.length = 0;
      return promise;
    }
  }
}

export default new BatchRecorder({
  logger: new MyLogger({
    endpoint: `${zipkinBaseUrl}/api/v2/spans`,
    jsonEncoder: JSONEncoder.JSON_V2,
  }),
});
