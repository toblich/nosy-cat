import * as httpErrors from "http-errors";

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
  logger
} from "helpers";

import Repository, { Result, Record, Transaction } from "./repository";
import { Component } from "./Graph";

export const defaultTestMetrics = {
  duration: 1,
  errored: true,
  timestamp: Date.now()
};

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
      "YZ"
    ]
      .map((s: string) => Array.from(s))
      .map(([caller, callee]: string[]) => ({ caller, callee, metrics: defaultTestMetrics }))
  );

  await add([
    ...componentCalls,
    { callee: "_", metrics: defaultTestMetrics },
    { callee: "$", metrics: defaultTestMetrics }
  ]);

  // Set abnormal statuses
  await Promise.all(Array.from("ABCFGHIJKMNOXYZ_").map((id: string) => repository.setStatus(id, "Abnormal")));

  // Test root causes search
  const cases = [
    ["A", "Causal chain", "BCGHIJKNO"],
    ["B", "Causal chain", "BCGHIJKNO"],
    ["C", "Causal chain", "BCGHIJKNO"],
    ["M", "Causal chain", "BCGHIJKNO"],
    ["G", "Causal chain", "GHIJ"],
    ["N", "Causal chain", "O"],
    ["O", "Causal chain", ""],
    ["K", "Causal chain", ""],
    ["_", "Causal chain", ""],
    ["$", "Causal chain", ""],
    ["X", "Causal chain", "XYZ"],
    ["Y", "Causal chain", "XYZ"],
    ["Z", "Causal chain", ""],
    ["Z", "Root causes", ""]
  ];
  for (const [initialId, op, ex] of cases) {
    await testHelper(initialId, op, ex);
  }
});

async function testHelper(initialId: string, operation: string, expectedUnsorted: string): Promise<void> {
  if (!["Root causes", "Causal chain"].includes(operation)) {
    throw new Error(`Unsupported test operation: ${operation}`);
  }
  const method = operation === "Root causes" ? findRootCauses : findCausalChain;
  const expected = Array.from(expectedUnsorted)
    .sort()
    .join("");

  // tslint:disable-next-line: typedef
  try {
    const results = (await method(initialId)).records
      .map((record: Record) => record.get("resultNode").properties.id)
      .sort()
      .join("");

    if (results === expected) {
      logger.info(`${operation} for ${initialId} are the expected ones!`);
    } else {
      logger.error(`${operation} for ${initialId} did not match the expected ones
      Expected: "${expected}"
      Actual:   "${results}"
      `);
    }
  } catch (error) {
    logger.error(`${operation} for ${initialId} errored with ${error.stack}`);
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

export async function findCausalChain(initialId: string, tx?: Transaction): Promise<Result> {
  const result = await (tx || repository).run(
    `
      MATCH (caller:Component {id: $initialId})-[* {callee_is: "Abnormal"}]->(resultNode :Component:Abnormal)
      RETURN DISTINCT resultNode
    `,
    { initialId }
  );

  return result;
}

export async function findRootCauses(initialId: string): Promise<Result> {
  const tx = repository.transaction();
  const chain = await findCausalChain(initialId, tx);
  const abnormalSubgraph = await toEntity(chain, tx);
  return findEnds(initialId, abnormalSubgraph);
}

async function toEntity(queryResult: Result, tx?: Transaction): Promise<any> {
  // TODO map from a neo4j results representation to an in-memory JS object that is easy to traverse
  // This will require querying the DB again to fetch outgoing relations, since we only have the nodes
  const ids: string[] = queryResult.records.map((record: Record) => record.get("resultNode").properties.id);

  throw new NotImplementedError();
}

function findEnds(initialId: string, subgraph: any): Result {
  // TODO Given an in-memory traversable graph, find the root causes (ends) beginning from a given initial id.
  // This is a synchronous method that just inspects/traverses the in-memory graph.
  // The return type may not be adequate, this is just a temporary definition
  throw new NotImplementedError();
  // return [];
}

export async function getFullGraph(): Promise<Result> {
  return repository.run(`MATCH (n:Component) RETURN n`);
}

class NotImplementedError extends Error {
  constructor() {
    super("Not Implemented :(");
  }
}
