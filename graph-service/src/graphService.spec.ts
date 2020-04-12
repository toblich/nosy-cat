import * as graphService from "./graphService";
import Repository, { Result, Record, Transaction } from "./repository";
import * as neo4j from "neo4j-driver";

function timeout(ms: number): Promise<void> {
  return new Promise((resolve: (...props: any[]) => any): any => setTimeout(resolve, ms));
}

async function testHelper(initialId: string, operation: string, expectedUnsorted: string): Promise<void> {
  if (!["Root causes", "Causal chain"].includes(operation)) {
    throw new Error(`Unsupported test operation: ${operation}`);
  }
  const method = operation === "Root causes" ? graphService.findRootCauses : graphService.findCausalChain;
  const expected = Array.from(expectedUnsorted)
    .sort()
    .join("");

  // tslint:disable-next-line: typedef
  try {
    const results = (await method(initialId)).records
      .map((record: Record) => record.get("resultNode").properties.id)
      .sort()
      .join("");

    if (results !== expected) {
      // tslint:disable-next-line:no-console
      throw Error(`${operation} for ${initialId} did not match the expected ones
        Expected: "${expected}"
        Actual:   "${results}"
        `);
    }
  } catch (error) {
    // tslint:disable-next-line:no-console
    throw Error(`${operation} for ${initialId} errored with ${error.stack}`);
  }
}

interface Test {
  initialId: string;
  op: string;
  ex: string;
}

describe("graph service", () => {
  let driver;
  let session;
  const repository = new Repository();

  beforeAll(async () => {
    driver = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic("neo4j", "bitnami"));
    session = driver.session();

    let isAlive = false;
    while (!isAlive) {
      try {
        await session.run("Return date() as currentDate");
        isAlive = true;
      } catch (e) {
        await timeout(500);
      }
    }

    try {
      await repository.clear();
    } catch (error) {
      throw Error("There was an error while clearing the DB");
    }

    // Create graph structure
    const componentCalls = [
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
      .map(([caller, callee]: string[]) => ({ caller, callee, metrics: graphService.defaultTestMetrics }));

    try {
      await graphService.add([
        ...componentCalls,
        { callee: "_", metrics: graphService.defaultTestMetrics },
        { callee: "$", metrics: graphService.defaultTestMetrics }
      ]);
    } catch (error) {
      throw Error(`There was an error while adding the component calls, ${error.stack}`);
    }

    // Set abnormal statuses
    try {
      await Promise.all(Array.from("ABCFGHIJKMNOXYZ_").map((id: string) => repository.setStatus(id, "Abnormal")));
    } catch (error) {
      throw Error(`There was an error while setting the abnormal statuses, ${error.stack}`);
    }
  });

  // Test root causes search

  const cases: Array<[string, Test]> = [
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
  ].map(([initialId, op, ex]: [string, string, string]) => [
    `${op} for ${initialId} to ${ex}`,
    {
      initialId,
      op,
      ex
    }
  ]);

  describe.each(cases)("when processing: %s", (_: string, test: Test) => {
    it("should be successful", async () => {
      const { initialId, op, ex } = test;
      await testHelper(initialId, op, ex);
    });
  });
});
