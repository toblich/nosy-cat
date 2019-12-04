import * as httpErrors from "http-errors";
import { flatMap, uniqBy, takeRightWhile } from "lodash";

import { Graph, Component } from "./Graph";
import * as metricsRepository from "./metrics";
import {
  Component as HelperComponent,
  ComponentStatus,
  ComponentPlainObject,
  ComponentCall,
  UINode,
  UIEdge,
  UIGraph,
  status
} from "helpers";

let graph = new Graph();

interface GraphDebugObject {
  [id: string]: HelperComponent;
}

export async function toPlainObject(): Promise<GraphDebugObject> {
  const plainGraph = graph.toPlainObject();

  const metricsByComponent: any = {};
  for (const componentId in plainGraph) {
    if (plainGraph.hasOwnProperty(componentId)) {
      // start fetching all component's metrics concurrently
      metricsByComponent[componentId] = metricsRepository.getCurrent(componentId);
    }
  }

  const graphDebugObject: GraphDebugObject = {};
  for (const componentId in plainGraph) {
    if (plainGraph.hasOwnProperty(componentId)) {
      // await and compose all results
      graphDebugObject[componentId] = {
        metrics: await metricsByComponent[componentId],
        ...plainGraph[componentId]
      };
    }
  }
  return graphDebugObject;
}

export async function toUIObject(): Promise<UIGraph> {
  const graphPlainObject = await toPlainObject();
  const nodes: UINode[] = [];
  const edges: UIEdge[] = [];
  for (const [componentId, component] of Object.entries(graphPlainObject)) {
    nodes.push({
      id: componentId,
      label: componentId,
      title: componentId,
      metadata: {
        status: component.status
      }
    });
    for (const depId of component.dependencies) {
      edges.push({
        from: componentId,
        to: depId,
        metadata: {}
      });
    }
  }
  return { nodes, edges };
}

export function clear(): void {
  graph = new Graph();
}

export async function add({ caller, callee, metrics }: ComponentCall): Promise<void> {
  if (caller && callee) {
    graph.addDependency(caller, callee);
  } else if (caller) {
    graph.addComponent(caller);
  } else if (callee) {
    graph.addComponent(callee);
  } else {
    throw new httpErrors.BadRequest('The request must contain a "caller" and/or a "callee"');
  }

  if (metrics) {
    await metricsRepository.processRequest({ ...metrics, component: callee });
  }
}

export async function search(id: string): Promise<HelperComponent> {
  const plain: ComponentPlainObject = graph.getComponent(id).toPlainObject();

  if (!plain) {
    throw new httpErrors.NotFound(`Component ${id} does not exist`);
  }

  const metrics = await metricsRepository.getCurrent(id);

  return { ...plain, metrics };
}

export function findRootCauses(initialId: string): ComponentPlainObject[] {
  const initialComponent = graph.getComponent(initialId).toPlainObject();
  if (!initialComponent) {
    throw new httpErrors.NotFound(
      `The requested initial id "${initialId}" is not a component in the graph ${graph.toString()}`
    );
  }

  if (status.isNormal(initialComponent.status)) {
    return [];
  }

  return uniqBy(internalDFS(initialId, new Set<string>(), []), "id");
}

export function updateComponentStatus(id: string, newStatus: ComponentStatus): any {
  // TODO types
  const component = graph.getComponent(id);
  const changes = {};

  // Current component
  const oldStatus = component.status;
  if (status.hasChanged(oldStatus, newStatus)) {
    changes[id] = { id, oldStatus, status: newStatus };
    component.status = newStatus;
  }

  // Perpetrators
  const newPerpetratorsFilter = (rc: ComponentPlainObject): boolean => rc.status !== ComponentStatus.PERPETRATOR;
  const newPerpetrators = findRootCauses(id).filter(newPerpetratorsFilter);
  for (const p of newPerpetrators) {
    changes[p.id] = {
      id: p.id,
      oldStatus: p.status,
      newStatus: ComponentStatus.PERPETRATOR
    };
    graph.getComponent(p.id).status = ComponentStatus.PERPETRATOR;
  }

  // Victims
  const isPerpetrator = graph.getComponent(id).status === ComponentStatus.PERPETRATOR;
  const newVictims = Array.from(component.consumers)
    .map((componentId: string) => graph.getComponent(componentId))
    .filter((rc: Component): boolean => rc.status === ComponentStatus.PERPETRATOR);
  if (!isPerpetrator) {
    newVictims.push(component);
  }
  for (const v of newVictims) {
    changes[v.id] = {
      id: v.id,
      oldStatus: v.status,
      newStatus: ComponentStatus.VICTIM
    };
    graph.getComponent(v.id).status = ComponentStatus.VICTIM;
  }

  return changes;
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

  const anomalousDeps = component.dependencies.filter((depId: string) =>
    status.isAnomalous(graph.getComponent(depId).status)
  );
  if (anomalousDeps.length === 0) {
    return [component];
  }

  path.push(component);
  return flatMap(anomalousDeps, (depId: string) => internalDFS(depId, visited, path));
}
