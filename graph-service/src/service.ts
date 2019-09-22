import * as httpErrors from "http-errors";
import { flatMap, uniqBy, takeRightWhile } from "lodash";

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
  const initialComponent = graph.getComponent(initialId).toPlainObject();
  if (!initialComponent) {
    throw new httpErrors.NotFound(
      `The requested initial id "${initialId}" is not a component in the graph ${graph.toString()}`
    );
  }

  if (initialComponent.status !== Status.ANOMALOUS) {
    return [];
  }

  return uniqBy(internalDFS(initialId, new Set<string>(), []), "id");
}

export function updateComponentStatus(id: string, status: Status): void {
  const component = graph.getComponent(id);
  component.status = status;
}

// ---

function internalDFS(id: string, visited: Set<string>, path: ComponentPlainObject[]): ComponentPlainObject[] {
  const component = graph.getComponent(id).toPlainObject();

  if (visited.has(id)) {
    // Cycle detected
    // Since the path array has the ordered list of components visited to reach the current component,
    // take the components visited since the first time that we visited the current one. That's the cycle
    // that has formed and was detected.
    const cycle = takeRightWhile(path, (c: ComponentPlainObject): boolean => c.id !== id);
    cycle.push(component);
    return cycle;
  }
  visited.add(id);

  const anomalousDeps = component.dependencies.filter(
    (depId: string) => graph.getComponent(depId).status === Status.ANOMALOUS
  );
  if (anomalousDeps.length === 0) {
    return [component];
  }

  path.push(component);
  return flatMap(anomalousDeps, (depId: string) => internalDFS(depId, visited, path));
}
