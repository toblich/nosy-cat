import * as httpErrors from "http-errors";

import { Graph, GraphPlainObject } from "./Graph";

let graph = new Graph();

export function toPlainObject(): GraphPlainObject {
  return graph.toPlainObject();
}

export function clear(): void {
  graph = new Graph();
}

interface ComponentCall {
  caller?: string;
  callee?: string;
}
export function add({ caller, callee }: ComponentCall): void {
  if (caller && callee) {
    graph.addDependency(caller, callee);
  } else if (caller) {
    graph.addComponent(caller);
  } else if (callee) {
    graph.addComponent(callee);
  } else {
    throw new httpErrors.BadRequest('The request, must contain a "caller" and/or a "callee"');
  }
}
