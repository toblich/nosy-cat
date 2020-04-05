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

import Repository, { Result, Record } from "./repository";
import { Component } from "./Graph";

const defaultTestMetrics = {
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
    ["AB", "BB", "BC", "CB", "BD", "BE", "EF", "BG", "GH", "HI", "IJ", "JG", "BK", "KL", "LM", "MB", "BN", "NO"]
      .map((s: string) => Array.from(s))
      .map(([caller, callee]: string[]) => ({ caller, callee, metrics: defaultTestMetrics }))
  );

  await add([
    ...componentCalls,
    { callee: "_", metrics: defaultTestMetrics },
    { callee: "$", metrics: defaultTestMetrics }
  ]);

  // Set abnormal statuses
  await Promise.all(Array.from("ABCFGHIJKMNO_").map((id: string) => repository.setStatus(id, "Abnormal")));

  // Test root causes search
  const cases = [
    ["A", "Causal chain", "BCGHIJKNO"],
    ["B", "Causal chain", "BCGHIJKNO"],
    ["G", "Causal chain", "GHIJ"],
    ["N", "Causal chain", "O"],
    ["O", "Causal chain", ""],
    ["K", "Causal chain", ""],
    ["_", "Causal chain", ""],
    ["$", "Causal chain", ""]
  ];
  for (const [root, op, ex] of cases) {
    await testHelper(root, op, ex);
  }
});

async function testHelper(root: string, operation: string, expectedUnsorted: string): Promise<void> {
  if (!["Root causes", "Causal chain"].includes(operation)) {
    throw new Error(`Unsupported test operation: ${operation}`);
  }
  const method = operation === "Root causes" ? findRootCauses : findCausalChain;
  const expected = Array.from(expectedUnsorted)
    .sort()
    .join("");

  // tslint:disable-next-line: typedef
  const results = (await method(root)).records
    .map((record: Record) => record.get("resultNode").properties.id)
    .sort()
    .join("");

  if (results === expected) {
    logger.info(`${operation} for ${root} are the expected ones!`);
  } else {
    logger.error(`${operation} for ${root} did not match the expected ones
    Expected: "${expected}"
    Actual:   "${results}"
    `);
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

export async function findCausalChain(initialId: string): Promise<Result> {
  const result = await repository.run(
    `
      MATCH (caller:Component {id: $initialId})-[* {callee_is: "Abnormal"}]->(resultNode :Component:Abnormal)
      RETURN DISTINCT resultNode
    `,
    { initialId }
  );

  return result;
}

export async function findRootCauses(initialId: string): Promise<Result> {
  throw new Error("NotImplemented");
  return findCausalChain(initialId);
}

export async function getFullGraph(): Promise<Result> {
  return repository.run(`MATCH (n:Component) RETURN n`);
}
