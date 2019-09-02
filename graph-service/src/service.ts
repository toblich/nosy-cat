import * as httpErrors from "http-errors";

import { Graph } from "./Graph";

let graph = new Graph();

export function toPlainObject() {
  return graph.toPlainObject();
}

export function clear() {
  graph = new Graph();
}

interface ComponentCall {
  caller?: string;
  callee?: string;
}
export function add({ caller, callee }: ComponentCall) {
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
