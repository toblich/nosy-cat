import * as httpErrors from "http-errors";

import { keyBy, flatMap, takeRightWhile, uniqBy, dropRight } from "lodash";

import {
  Component as HelperComponent,
  ComponentStatus,
  ComponentPlainObject,
  ComponentCall,
  Dictionary,
  UINode,
  UIEdge,
  UIGraph,
  status,
  logger,
} from "helpers";

import Repository, { Result, Record, Transaction } from "./repository";
import { Component } from "./Graph";

//////////////////////
// --- Types ---
//////////////////////

export interface Node {
  id: string;
  dependencies: string[];
  depsSet: Set<string>;
  // TODO include and shape metrics here
}

//////////////////////////
// --- Initialization ---
//////////////////////////

const repository = new Repository();

logger.warn("Initializing graph!");
repository.clear();

///////////////////////////
// --- Service methods ---
///////////////////////////

export async function clear(): Promise<void> {
  return repository.clear();
}

export async function add(calls: ComponentCall[]): Promise<void> {
  return transact(async (tx: Transaction) => {
    for (const { caller, callee, metrics } of calls) {
      await repository.addCall(caller, callee, metrics, tx);
    }
  });
}

export async function search(id: string): Promise<Component> {
  return repository.getComponent(id);
}

export async function findCausalChain(initialId: string, tx?: Transaction): Promise<Node[]> {
  const result = await repository.getAbnormalChain(initialId, tx);

  if (result.records.length === 0) {
    // Caller is not abnormal, so there is no causal chain whatsoever
    return [];
  }

  // TODO consider moving logic into repository
  const caller = result.records[0].get("caller").properties;
  const tail = result.records.map((r: Record) => r.get("resultNode")?.properties).filter((n: Node | null) => n);

  return [caller, ...tail];
}

export async function findRootCauses(initialId: string): Promise<Node[]> {
  const abnormalSubgraph = await transact(async (tx: Transaction) => {
    const chain = await findCausalChain(initialId, tx);
    return chain.length === 0 ? {} : toEntity(initialId, chain, tx);
  });

  return findEnds(initialId, abnormalSubgraph);
}

/////////////////////
// -- Private ---
/////////////////////

interface Supernode extends Node {
  nodes: Node[];
}

async function transact<T>(fn: (tx: Transaction) => Promise<T>): Promise<T> {
  const tx = repository.transaction();

  try {
    const result = await fn(tx);
    if (tx.isOpen()) {
      tx.commit();
    }
    return result;
  } catch (e) {
    logger.error(e);
    if (tx.isOpen()) {
      await tx.rollback();
    }
    throw e;
  }
}

async function toEntity(initialId: string, nodes: Node[], tx?: Transaction): Promise<Dictionary<Node>> {
  // TODO add and shape metrics
  const ids = [initialId, ...nodes.map((n: Node) => n.id)];
  const relationships = await repository.getDependenciesBetween(ids, tx);
  const nodesById = keyBy(nodes, "id");

  for (const { callerId, calleeId } of relationships) {
    if (nodesById[callerId].dependencies) {
      nodesById[callerId].dependencies.push(calleeId);
    } else {
      nodesById[callerId].dependencies = [calleeId];
    }
  }
  for (const id of ids) {
    if (!nodesById[id].dependencies) {
      nodesById[id].dependencies = [];
    }
    nodesById[id].depsSet = new Set(nodesById[id].dependencies);
  }

  return nodesById;
}

function findEnds(initialId: string, subgraph: Dictionary<Node>): Node[] {
  const component = subgraph[initialId];
  if (!component) {
    // Either the component is in Normal status (therefore, not in the abnormal subgraph)
    // or it's not present at all. In the latter, it would be nice to throw an error, but
    // we don't have enough info here yet (only abnormal nodes are present here).
    logger.warn(
      `${initialId} was not found when looking for root causes in graph ${JSON.stringify(subgraph, null, 4)}`
    );
    return [];
  }

  const ends = internalDFS(subgraph, initialId);

  // Dedupe and split super-nodes into their parts
  // TODO: Dependencies of nodes may still link to supernode instead of the original parts
  return uniqBy(
    flatMap(ends, (node: Supernode) => (isRegularNodeId(node.id) ? node : node.nodes)),
    "id"
  );
}

function internalDFS(
  subgraph: Dictionary<Node>,
  id: string,
  visited: Set<string> = new Set(),
  path: Node[] = [],
  parentId: string = null
): Node[] {
  let component: Node = subgraph[id];

  if (!component || (parentId && !subgraph[parentId])) {
    // Case for when accessing a node that has been merged into a supernode
    return [];
  }

  if (visited.has(id)) {
    // * Cycle detected!
    // Since the path array has the ordered list of components visited to reach the current component,
    // take the components visited since the first time that we visited the current one. That's the cycle
    // that has formed and was detected.
    const cycle = takeRightWhile(path, (c: Node): boolean => c.id !== component.id);
    cycle.push(component);
    const cycleIds = cycle.map((n: Node) => n.id);
    const cycleIdsSet = new Set(cycleIds);

    // Create supernode
    const supernodeId = toSupernodeId(cycleIds);
    const supernodeDepsSet = new Set(
      flatMap(cycle, (n: Node) => n.dependencies.filter((d: string) => !cycleIdsSet.has(d)))
    );
    const supernode: Supernode = {
      id: supernodeId,
      dependencies: Array.from(supernodeDepsSet),
      depsSet: supernodeDepsSet,
      nodes: cycle,
    };

    // Remove existing nodes of the cycle merged into supernode from the graph an the visited set
    // Also mark dependencies as not visited
    for (const cycleId of cycleIds) {
      visited.delete(cycleId);
      for (const depId of subgraph[cycleId].dependencies) {
        visited.delete(depId);
      }
      delete subgraph[cycleId];
    }
    // Remove all visited nodes that are path of the cycle, as they will be re-added as just the supernode
    path.splice(path.length - cycle.length);

    // For nodes that depended on something in the cycle, change that dep to be on the supernode
    for (const node of Object.values(subgraph)) {
      node.depsSet = new Set(node.dependencies.map((dep: string) => (cycleIdsSet.has(dep) ? supernodeId : dep)));
      node.dependencies = Array.from(node.depsSet);
    }

    // Add supernode to graph
    subgraph[supernodeId] = supernode;

    // Set supernode as current component being visited
    component = supernode;
  }

  visited.add(component.id);

  if (!component.dependencies || component.dependencies.length === 0) {
    return [component];
  }

  path.push(component);
  return flatMap(component.dependencies, (depId: string) => internalDFS(subgraph, depId, visited, path, component.id));
}

const SUPERNODE_PREFIX = "__supernode_cycle";
const SUPERNODE_SEPARATOR = "...";

// begins with prefix - separator - nodeId - separator - (non-empty tail)
// The tail should follow the id-separator-id pattern but is not checked)
const SUPERNODE_REGEX = new RegExp([`^${SUPERNODE_PREFIX}`, ".*", "."].join(SUPERNODE_SEPARATOR));

function isSupernodeId(id: string): boolean {
  return SUPERNODE_REGEX.test(id);
}

function isRegularNodeId(id: string): boolean {
  return !isSupernodeId(id);
}

function toSupernodeId(ids: string[]): string {
  return [SUPERNODE_PREFIX, ...ids].join(SUPERNODE_SEPARATOR);
}

export async function getFullGraph(): Promise<Result> {
  return repository.getFullGraph();
}
