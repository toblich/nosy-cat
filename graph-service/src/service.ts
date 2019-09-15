import * as httpErrors from "http-errors";
import { flatMap } from "lodash";

import { Graph, GraphPlainObject, ComponentPlainObject, Status } from "./Graph";

let graph = new Graph();

export function toPlainObject(): GraphPlainObject {
  return graph.toPlainObject();
}

export function clear(): void {
  graph = new Graph();
}

export interface ComponentCall {
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
    throw new httpErrors.BadRequest('The request must contain a "caller" and/or a "callee"');
  }
}

export function getPlain(id: string): ComponentPlainObject {
  const plain: ComponentPlainObject = graph.getComponent(id).toPlainObject();

  if (!plain) {
    throw new httpErrors.NotFound(`Component ${id} does not exist`);
  }

  return plain;
}

export function findRootCauses(initialId: string): ComponentPlainObject[] {
  if (!graph.hasComponent(initialId)) {
    return [];
    // throw new httpErrors.NotFound(`The requested initial id "${initialId}" is not a component in the graph`);
  }

  return internalDFS(initialId, new Set<string>(), []);
}

export function updateComponentStatus(id: string, status: Status): void {
  const component = graph.getComponent(id);
  component.status = status;
}

// ---

function internalDFS(id: string, visited: Set<string>, rootCauses: ComponentPlainObject[]): ComponentPlainObject[] {
  if (visited.has(id)) {
    return [];
  }

  visited.add(id);
  const component = graph.getComponent(id).toPlainObject();

  if (component.status !== Status.ANOMALOUS) {
    return [];
  }

  const hasBrokenDeps = component.dependencies.some(
    (depId: string) => graph.getComponent(depId).status === Status.ANOMALOUS
  );
  if (!hasBrokenDeps) {
    return [component];
  }

  return flatMap(component.dependencies, (depId: string) => internalDFS(depId, visited, rootCauses));
}
