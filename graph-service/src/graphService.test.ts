import * as graphService from "./graphService";
import { ComponentStatus, ComponentCall, Dictionary } from "helpers";
import * as neo4j from "neo4j-driver";
import { merge } from "lodash";

// [
//   "AB",
//   "BC",
//   "CB",
//   "BD",
//   "BE",
//   "EF",
//   "BG",
//   "GH",
//   "HI",
//   "IJ",
//   "JG",
//   "BK",
//   "KL",
//   "LM",
//   "MB",
//   "BN",
//   "NO",
//   "XY",
//   "YX",
//   "XZ",
//   "YZ",
// ]

//#region
// ---

// describe("graph service", () => {
//   const repository = new Repository();

//   beforeAll(async () => {
//     await availableDb();

//     try {
//       await repository.clear();
//     } catch (error) {
//       throw Error("There was an error while clearing the DB");
//     }

//     // Create graph structure
//     const componentCalls = await Promise.all(
//       [
//         "AB",
//         "BB",
//         "BC",
//         "CB",
//         "BD",
//         "BE",
//         "EF",
//         "BG",
//         "GH",
//         "HI",
//         "IJ",
//         "JG",
//         "BK",
//         "KL",
//         "LM",
//         "MB",
//         "BN",
//         "NO",
//         "XY",
//         "YX",
//         "XZ",
//         "YZ",
//       ]
//         .map((s: string) => Array.from(s))
//         .map(([caller, callee]: string[]) => ({ caller, callee, metrics: defaultTestMetrics }))
//     );

//     try {
//       // console.log("componentCalls", componentCalls);
//       await graphService.add([
//         ...componentCalls,
//         { callee: "_", metrics: defaultTestMetrics },
//         { callee: "$", metrics: defaultTestMetrics },
//       ]);
//     } catch (error) {
//       throw Error(`There was an error while adding the component calls, ${error.stack}`);
//     }

//     // Set abnormal statuses
//     try {
//       await Promise.all(
//         Array.from("ABCFGHIJKMNOXYZ_").map((id: string) => repository.setStatus(id, ComponentStatus.CONFIRMED))
//       );
//     } catch (error) {
//       throw Error(`There was an error while setting the abnormal statuses, ${error.stack}`);
//     }
//   });

// // Test root causes search

// const cases: [string, Test][] = [
//   ["A", "Causal chain", "ABCGHIJKNO"],
//   ["B", "Causal chain", "BCGHIJKNO"],
//   ["C", "Causal chain", "BCGHIJKNO"],
//   ["D", "Causal chain", ""], // Node is healthy
//   ["L", "Causal chain", ""], // Node is healthy
//   ["M", "Causal chain", "MBCGHIJKNO"],
//   ["G", "Causal chain", "GHIJ"],
//   ["N", "Causal chain", "NO"],
//   ["O", "Causal chain", "O"],
//   ["K", "Causal chain", "K"],
//   ["_", "Causal chain", "_"],
//   ["$", "Causal chain", ""],
//   ["X", "Causal chain", "XYZ"],
//   ["Y", "Causal chain", "XYZ"],
//   ["Z", "Causal chain", "Z"],
//   ["N", "Root causes", "O"],
//   ["Z", "Root causes", "Z"],
//   ["X", "Root causes", "Z"],
//   ["Y", "Root causes", "Z"],
//   ["A", "Root causes", "GHIJKO"],
//   ["B", "Root causes", "GHIJKO"],
//   ["M", "Root causes", "GHIJKO"],
//   ["O", "Root causes", "O"],
//   ["K", "Root causes", "K"],
//   ["G", "Root causes", "GHIJ"],
//   ["H", "Root causes", "GHIJ"],
//   ["I", "Root causes", "GHIJ"],
//   ["J", "Root causes", "GHIJ"],
//   ["_", "Root causes", "_"],
//   ["$", "Root causes", ""], // Node is healthy
//   ["E", "Root causes", ""], // Node is healthy
//   ["F", "Root causes", "F"],
// ].map(([initialId, op, ex]: [string, string, string]) => [
//   `${op} for ${initialId} to ${ex}`,
//   {
//     initialId,
//     op,
//     ex,
//   },
// ]);

// interface Test {
//   initialId: string;
//   op: string;
//   ex: string;
// }

// describe.each(cases)("when processing: %s", (_: string, test: Test) => {
//   it("should be successful", async () => {
//     const { initialId, op, ex } = test;
//     await testHelper(initialId, op, ex);
//   });
// });
// });
//#endregion

const defaultTestMetrics = Object.freeze({
  duration: 1,
  errored: true,
  timestamp: Date.now(),
});

const { CONFIRMED, PERPETRATOR, VICTIM, NORMAL } = ComponentStatus;

let _testCounter = 0; // This is just a hack so that Jest report does not bundle together things that shouldn't

describe("new tests", () => {
  beforeAll(async () => {
    await availableDb();

    try {
      await graphService.clear();
    } catch (error) {
      throw Error("There was an error while clearing the DB");
    }
  });

  describe("single node case", () => {
    initialize({ A: [] });
    test("A", NORMAL, {});
    test("A", CONFIRMED, change("A", CONFIRMED, PERPETRATOR)); // TODO the change should be from "Normal" to "Perp"
    test("A", CONFIRMED, {});
    test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
  });

  describe("single call case", () => {
    const graph = Object.freeze({ A: ["B"] });

    describe("applying changes only to A", () => {
      initialize(graph);
      test("A", NORMAL, {});
      test("A", CONFIRMED, change("A", CONFIRMED, PERPETRATOR)); // TODO the change should be from "Normal" to "Perp"
      test("A", CONFIRMED, {});
      test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
    });

    describe("applying changes only to B", () => {
      initialize(graph);
      test("B", NORMAL, {});
      test("B", CONFIRMED, change("B", CONFIRMED, PERPETRATOR)); // TODO the change should be from "Normal" to "Perp"
      test("B", CONFIRMED, {});
      test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
    });

    describe("applying changes to both", () => {
      initialize(graph);
      test("A", CONFIRMED, change("A", CONFIRMED, PERPETRATOR)); // TODO the change should be from "Normal" to "Perp"
      test("B", CONFIRMED, merge(change("B", CONFIRMED, PERPETRATOR), change("A", PERPETRATOR, VICTIM))); // TODO the change should be from "Normal" to "Perp"
      // both CONFIRMED now

      test("B", NORMAL, merge(change("B", PERPETRATOR, NORMAL), change("A", VICTIM, PERPETRATOR)));
      test("B", CONFIRMED, merge(change("B", CONFIRMED, PERPETRATOR), change("A", PERPETRATOR, VICTIM))); // TODO the change should be from "Normal" to "Perp"
      // both CONFIRMED now

      test("A", NORMAL, change("A", VICTIM, NORMAL));
    });
  });

  // ---

  function initialize(graph: Dictionary<string[]>): void {
    _testCounter = 0;
    beforeAll(() => setGraph(graph));
  }

  async function setGraph(graph: Dictionary<string[]>): Promise<void> {
    await graphService.clear();
    const componentCalls = Object.entries(graph).flatMap(([caller, callees]: [string, string[]]) => {
      return !callees || callees.length === 0
        ? { callee: caller, metrics: defaultTestMetrics }
        : callees.map((callee: string) => ({ caller, callee, metrics: defaultTestMetrics }));
    });
    try {
      await graphService.add([...componentCalls]);
    } catch (error) {
      throw Error(`There was an error while adding the component calls, ${error.stack}`);
    }
  }

  function test(id: string, status: ComponentStatus, expectedChanges: any): void {
    describe(`[${++_testCounter}] and ${id} becomes ${status}`, () => {
      let changes;
      beforeAll(async () => (changes = await graphService.updateComponentStatus(id, status)));
      it(`should return the expected changes`, () => expect(changes).toEqual(expectedChanges));
    });
  }

  function change(id: string, fromStatus: ComponentStatus, toStatus: ComponentStatus): Dictionary<graphService.Change> {
    return {
      [id]: {
        id,
        from: { status: fromStatus },
        to: { status: toStatus },
      },
    };
  }

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
});
