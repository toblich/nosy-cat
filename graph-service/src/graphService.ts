import * as httpErrors from "http-errors";

import { keyBy, flatMap, takeRightWhile, uniqBy } from "lodash";

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

export const defaultTestMetrics = {
  duration: 1,
  errored: true,
  timestamp: Date.now(),
};

interface Node {
  id: string;
  dependencies?: Set<string>;
  depsArray: string[];
  // TODO include and shape metrics here
}

const repository = new Repository();

logger.warn("Initializing graph!");
// TODO the following promise chain is just for local testing
repository.clear().then(async () => {
  // Create graph structure
  const componentCalls = await Promise.all(
    [
      "AB",
      "BB",
      "BC",
      "CB",
      "BD",
      "BE",
      "EF",
      "BG",
      "GH",
      "HI",
      "IJ",
      "JG",
      "BK",
      "KL",
      "LM",
      "MB",
      "BN",
      "NO",
      "XY",
      "YX",
      "XZ",
      "YZ",
    ]
      .map((s: string) => Array.from(s))
      .map(([caller, callee]: string[]) => ({ caller, callee, metrics: defaultTestMetrics }))
  );

  logger.level = "info";

  await add([
    ...componentCalls,
    { callee: "_", metrics: defaultTestMetrics },
    { callee: "$", metrics: defaultTestMetrics },
  ]);

  // Set abnormal statuses
  await Promise.all(Array.from("ABCFGHIJKMNOXYZ_").map((id: string) => repository.setStatus(id, "Abnormal")));

  // Test root causes search
  const cases = [
    ["A", "Causal chain", "ABCGHIJKNO"],
    ["B", "Causal chain", "BCGHIJKNO"],
    ["C", "Causal chain", "BCGHIJKNO"],
    ["D", "Causal chain", ""], // Node is healthy
    ["L", "Causal chain", ""], // Node is healthy
    ["M", "Causal chain", "MBCGHIJKNO"],
    ["G", "Causal chain", "GHIJ"],
    ["N", "Causal chain", "NO"],
    ["O", "Causal chain", "O"],
    ["K", "Causal chain", "K"],
    ["_", "Causal chain", "_"],
    ["$", "Causal chain", ""],
    ["X", "Causal chain", "XYZ"],
    ["Y", "Causal chain", "XYZ"],
    ["Z", "Causal chain", "Z"],
    ["N", "Root causes", "O"],
    ["Z", "Root causes", "Z"],
    ["X", "Root causes", "Z"],
    ["Y", "Root causes", "Z"],
    ["A", "Root causes", ""], // TODO complete expected values
    ["B", "Root causes", ""], // TODO complete expected values
    // TODO add more cases
  ];
  for (const [initialId, operation, expected] of cases) {
    try {
      await testHelper(initialId, operation, expected);
    } catch (error) {
      logger.error(`${operation} for ${initialId} errored with ${error.stack}`);
      break;
    }
  }
});

async function testHelper(initialId: string, operation: string, expectedUnsorted: string): Promise<void> {
  if (!["Root causes", "Causal chain"].includes(operation)) {
    throw new Error(`Unsupported test operation: ${operation}`);
  }
  const expected = Array.from(expectedUnsorted).sort().join("");

  const idsArray =
    operation === "Root causes"
      ? (await findRootCauses(initialId)).map((r: Node) => r.id)
      : (await findCausalChain(initialId)).map((r: Node) => r.id);

  const results = idsArray.sort().join("");

  if (results === expected) {
    logger.info(`${operation} for ${initialId} are the expected ones!`);
  } else {
    logger.error(`${operation} for ${initialId} did not match
      Expected: "${expected}"
      Actual:   "${results}"
    `);
    throw new Error("FailedTest");
  }
}

export async function clear(): Promise<void> {
  return repository.clear();
}

export async function add(calls: ComponentCall[]): Promise<void> {
  const tx = repository.transaction();
  try {
    for (const { caller, callee, metrics } of calls) {
      await repository.addCall(caller, callee, metrics, tx);
    }
    return tx.commit();
  } catch (e) {
    logger.error(e);
    await tx.rollback();
    throw e;
  }
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
  const tx = repository.transaction();
  let abnormalSubgraph;
  try {
    const chain = await findCausalChain(initialId, tx);
    abnormalSubgraph = await toEntity(initialId, chain, tx);
    logger.data(`Abnormal subgraph from ${initialId}: ${JSON.stringify(abnormalSubgraph, null, 4)}`);
    await tx.commit();
  } catch (e) {
    logger.error(e);
    await tx.rollback();
    throw e;
  }

  return findEnds(initialId, abnormalSubgraph);
}

async function toEntity(initialId: string, nodes: Node[], tx?: Transaction): Promise<Dictionary<Node>> {
  // TODO add and shape metrics
  const ids = [initialId, ...nodes.map((n: Node) => n.id)];
  const relationships = await repository.getDependenciesBetween(ids, tx);
  const nodesById = keyBy(nodes, "id");

  for (const { callerId, calleeId } of relationships) {
    if (nodesById[callerId].depsArray) {
      nodesById[callerId].depsArray.push(calleeId);
    } else {
      nodesById[callerId].depsArray = [calleeId];
    }
  }
  for (const id of ids) {
    nodesById[id].dependencies = new Set(nodesById[id].depsArray);
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
  return uniqBy(ends, "id");
}

function internalDFS(
  subgraph: Dictionary<Node>,
  id: string,
  visited: Set<string> = new Set(),
  path: Node[] = []
): Node[] {
  const component = subgraph[id];

  if (visited.has(id)) {
    // Cycle detected
    // Since the path array has the ordered list of components visited to reach the current component,
    // take the components visited since the first time that we visited the current one. That's the cycle
    // that has formed and was detected.
    const cycle = takeRightWhile(path, (c: Node): boolean => c.id !== id);
    cycle.push(component);
    return cycle;
  }
  visited.add(id);

  if (!component.depsArray || component.depsArray.length === 0) {
    return [component];
  }

  path.push(component);
  return flatMap(component.depsArray, (depId: string) => internalDFS(subgraph, depId, visited, path));
}

export async function getFullGraph(): Promise<Result> {
  return repository.getFullGraph();
}

// TODO delete when no longer used
class NotImplementedError extends Error {
  constructor() {
    super("Not Implemented :(");
  }
}
