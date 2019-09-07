import { ComponentCall, GraphServiceRequestBody } from "./types";
import * as superagent from "superagent";

class GraphClient {
  private url: string;

  constructor(url: string) {
    this.url = url;
  }

  public postComponentCalls = (componentCalls: ComponentCall[]) => {
    const requestBody: GraphServiceRequestBody = { componentCalls };

    return superagent
      .post(`${this.url}/graph`)
      .send(requestBody)
      .set("Content-Type", "json");
  };
}

export { GraphClient };
