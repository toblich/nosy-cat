import * as graphService from "./graphService";
import Repository, { Result, Record, Transaction } from "./repository";
import * as neo4j from "neo4j-driver";

function timeout(ms: number): Promise<void> {
  return new Promise((resolve: (...props: any[]) => any): any => setTimeout(resolve, ms));
}

async function availableDb(): Promise<void> {
  if (!process.env.NEO4J_HOST) {
    throw new Error("NEO4J_HOST unspecified");
  }
  const driver = neo4j.driver(process.env.NEO4J_HOST, neo4j.auth.basic("neo4j", "bitnami"));
  const session = driver.session();
  let isAlive = false;
  while (!isAlive) {
    try {
      await session.run("Return date() as currentDate");
      isAlive = true;
    } catch (e) {
      await timeout(500);
    }
  }
  await session.close();
  await driver.close();
}

async function testHelper(initialId: string, operation: string, expectedUnsorted: string): Promise<void> {
  if (!["Root causes", "Causal chain"].includes(operation)) {
    throw new Error(`Unsupported test operation: ${operation}`);
  }
  const expected = Array.from(expectedUnsorted).sort().join("");

  const idsArray: string[] =
    operation === "Root causes"
      ? (await graphService.findRootCauses(initialId)).map((r: graphService.Node) => r.id)
      : (await graphService.findCausalChain(initialId)).map((r: graphService.Node) => r.id);

  const results = idsArray.sort().join("");

  if (results !== expected) {
    throw new Error(`${operation} for ${initialId} did not match
      Expected: "${expected}"
      Actual:   "${results}"
    `);
  }
}

// ---

describe("graph service", () => {
  const repository = new Repository();

  const defaultTestMetrics = Object.freeze({
    duration: 1,
    errored: true,
    timestamp: Date.now(),
  });

  beforeAll(async () => {
    await availableDb();

    try {
      await repository.clear();
    } catch (error) {
      throw Error("There was an error while clearing the DB");
    }

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

    try {
      await graphService.add([
        ...componentCalls,
        { callee: "_", metrics: defaultTestMetrics },
        { callee: "$", metrics: defaultTestMetrics },
      ]);
    } catch (error) {
      throw Error(`There was an error while adding the component calls, ${error.stack}`);
    }

    // Set abnormal statuses
    try {
      await Promise.all(Array.from("ABCFGHIJKMNOXYZ_").map((id: string) => repository.setStatus(id, "CONFIRMED")));
    } catch (error) {
      throw Error(`There was an error while setting the abnormal statuses, ${error.stack}`);
    }
  });

  // Test root causes search

  const cases: [string, Test][] = [
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
    ["A", "Root causes", "GHIJKO"],
    ["B", "Root causes", "GHIJKO"],
    ["M", "Root causes", "GHIJKO"],
    ["O", "Root causes", "O"],
    ["K", "Root causes", "K"],
    ["G", "Root causes", "GHIJ"],
    ["H", "Root causes", "GHIJ"],
    ["I", "Root causes", "GHIJ"],
    ["J", "Root causes", "GHIJ"],
    ["_", "Root causes", "_"],
    ["$", "Root causes", ""], // Node is healthy
    ["E", "Root causes", ""], // Node is healthy
    ["F", "Root causes", "F"],
  ].map(([initialId, op, ex]: [string, string, string]) => [
    `${op} for ${initialId} to ${ex}`,
    {
      initialId,
      op,
      ex,
    },
  ]);

  interface Test {
    initialId: string;
    op: string;
    ex: string;
  }

  describe.each(cases)("when processing: %s", (_: string, test: Test) => {
    it("should be successful", async () => {
      const { initialId, op, ex } = test;
      await testHelper(initialId, op, ex);
    });
  });
});
