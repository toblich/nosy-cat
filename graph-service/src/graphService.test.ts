import * as graphService from "./graphService";
import { ComponentStatus, ComponentCall, Dictionary } from "helpers";
import * as neo4j from "neo4j-driver";
import { merge } from "lodash";

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

    graphService.setTransitioningThresholds({ [NORMAL]: 1, [CONFIRMED]: 1 });

    try {
      await graphService.clear();
    } catch (error) {
      throw Error("There was an error while clearing the DB");
    }
  });

  describe("single-node graph (A)", () => {
    initialize({ A: [] });
    test("A", NORMAL, {});
    test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
    test("A", CONFIRMED, {});
    test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
  });

  describe("two-node graph", () => {
    describe("single call (A -> B)", () => {
      const graph = Object.freeze({ A: ["B"] });

      describe("applying changes only to A", () => {
        initialize(graph);
        test("A", NORMAL, {});
        test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
        test("A", CONFIRMED, {});
        test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
      });

      describe("applying changes only to B", () => {
        initialize(graph);
        test("B", NORMAL, {});
        test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
        test("B", CONFIRMED, {});
        test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
      });

      describe("applying changes to both", () => {
        initialize(graph);
        test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
        test("B", CONFIRMED, merge(change("B", NORMAL, PERPETRATOR), change("A", PERPETRATOR, VICTIM)));
        // both CONFIRMED now

        test("B", NORMAL, merge(change("B", PERPETRATOR, NORMAL), change("A", VICTIM, PERPETRATOR)));
        test("B", CONFIRMED, merge(change("B", NORMAL, PERPETRATOR), change("A", PERPETRATOR, VICTIM)));
        // both CONFIRMED now

        test("A", NORMAL, change("A", VICTIM, NORMAL));
      });
    });

    describe("two-node cycle (A <-> B)", () => {
      const graph = Object.freeze({ A: ["B"], B: ["A"] });

      describe("applying changes only to one node", () => {
        initialize(graph);
        test("A", NORMAL, {});
        test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
        test("A", CONFIRMED, {});
        test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
      });

      describe("applying changes to both", () => {
        initialize(graph);
        test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
        test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
        // both CONFIRMED now

        test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
        test("A", NORMAL, change("A", PERPETRATOR, NORMAL));
      });
    });
  });

  describe("three-node graph", () => {
    // Case 3.1
    describe("chain (A -> B -> C)", () => {
      initialize({ A: ["B"], B: ["C"], C: [] });

      // Test 3.1
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("C", CONFIRMED, change("C", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, merge(change("A", PERPETRATOR, VICTIM), change("B", NORMAL, VICTIM)));

      // Reciprocal
      test("B", NORMAL, merge(change("A", VICTIM, PERPETRATOR), change("B", VICTIM, NORMAL)));
    });

    // Case 3.6
    describe("loop with tail (A <- B <-> C)", () => {
      initialize({ A: [], B: ["A", "C"], C: ["B"] });
      test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
      test("C", CONFIRMED, change("C", NORMAL, PERPETRATOR));

      // Test 3.6.a
      test(
        "A",
        CONFIRMED,
        merge(change("A", NORMAL, PERPETRATOR), change("B", PERPETRATOR, VICTIM), change("C", PERPETRATOR, VICTIM))
      );
      // Test 3.6.b
      test(
        "A",
        NORMAL,
        merge(change("A", PERPETRATOR, NORMAL), change("B", VICTIM, PERPETRATOR), change("C", VICTIM, PERPETRATOR))
      );
    });

    // Case 3.9
    describe("8-shape loops (A <-> B <-> C)", () => {
      initialize({ A: ["B"], B: ["A", "C"], C: ["B"] });
      test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
      test("C", CONFIRMED, change("C", NORMAL, PERPETRATOR));

      // Test 3.9.a
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      // Test 3.9.b
      test("A", NORMAL, change("A", PERPETRATOR, NORMAL));

      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));

      // Test 3.9.c
      test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
      // Test 3.9.d
      test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
    });

    // Case 3.14
    describe("single big loop (~ A <- B <- C <~)", () => {
      initialize({ A: ["C"], B: ["A"], C: ["B"] });
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, change("B", NORMAL, VICTIM));

      // Test 3.14.a
      test("C", CONFIRMED, merge(change("B", VICTIM, PERPETRATOR), change("C", NORMAL, PERPETRATOR)));

      // Test 3.14.b
      test("C", NORMAL, merge(change("B", PERPETRATOR, VICTIM), change("C", PERPETRATOR, NORMAL)));
    });

    // Case 3.15
    describe("Cycle is part of bigger cycle A <- B <-> C ; A -> C", () => {
      initialize({ A: ["C"], B: ["A", "C"], C: ["B"] });

      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, change("B", NORMAL, VICTIM));

      // Test 3.15.a
      test("C", CONFIRMED, merge(change("B", VICTIM, PERPETRATOR), change("C", NORMAL, PERPETRATOR)));

      // Test 3.15.b
      test("C", NORMAL, merge(change("B", PERPETRATOR, VICTIM), change("C", PERPETRATOR, NORMAL)));

      test("A", NORMAL, merge(change("A", PERPETRATOR, NORMAL), change("B", VICTIM, PERPETRATOR)));
      test("C", CONFIRMED, change("C", NORMAL, PERPETRATOR));

      // Test 3.15.c
      test("A", CONFIRMED, merge(change("A", NORMAL, PERPETRATOR)));

      // Test 3.15.d
      test("A", NORMAL, merge(change("A", PERPETRATOR, NORMAL)));

      test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
      test("A", CONFIRMED, change("A", NORMAL, VICTIM));

      // Test 3.15.e
      test("B", CONFIRMED, merge(change("A", VICTIM, PERPETRATOR), change("B", NORMAL, PERPETRATOR)));

      // Test 3.15.f
      test("B", NORMAL, merge(change("A", PERPETRATOR, VICTIM), change("B", PERPETRATOR, NORMAL)));
    });

    // Case 3.27
    describe("3-complete graph", () => {
      initialize({ A: ["B", "C"], B: ["A", "C"], C: ["A", "B"] });
      test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
      test("C", CONFIRMED, change("C", NORMAL, PERPETRATOR));

      // Test 3.27.a
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      // Test 3.27.b
      test("A", NORMAL, change("A", PERPETRATOR, NORMAL));

      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));

      // Test 3.27.c
      test("B", NORMAL, change("B", PERPETRATOR, NORMAL));
      // Test 3.27.d
      test("B", CONFIRMED, change("B", NORMAL, PERPETRATOR));
    });
  });

  describe("Multi-node graph", () => {
    // Case 4.1
    describe("D depends on ring", () => {
      initialize({ A: ["B"], B: ["C"], C: ["D"], D: ["E"], E: ["A"], F: ["A"] });
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, merge(change("A", PERPETRATOR, VICTIM), change("B", NORMAL, PERPETRATOR)));
      test("C", CONFIRMED, merge(change("B", PERPETRATOR, VICTIM), change("C", NORMAL, PERPETRATOR)));
      test("D", CONFIRMED, merge(change("C", PERPETRATOR, VICTIM), change("D", NORMAL, PERPETRATOR)));
      test(
        "E",
        CONFIRMED,
        merge(
          change("A", VICTIM, PERPETRATOR),
          change("B", VICTIM, PERPETRATOR),
          change("C", VICTIM, PERPETRATOR),
          change("E", NORMAL, PERPETRATOR)
        )
      );

      // Case 4.1.a
      test("F", CONFIRMED, merge(change("F", NORMAL, VICTIM)));

      // Case 4.1.b
      test("F", NORMAL, merge(change("F", VICTIM, NORMAL)));
    });

    // Case 4.2
    describe("Ring depends on F", () => {
      initialize({ A: ["B", "F"], B: ["C"], C: ["D"], D: ["E"], E: ["A"], F: [] });
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, merge(change("A", PERPETRATOR, VICTIM), change("B", NORMAL, PERPETRATOR)));
      test("C", CONFIRMED, merge(change("B", PERPETRATOR, VICTIM), change("C", NORMAL, PERPETRATOR)));
      test("D", CONFIRMED, merge(change("C", PERPETRATOR, VICTIM), change("D", NORMAL, PERPETRATOR)));
      test(
        "E",
        CONFIRMED,
        merge(
          change("A", VICTIM, PERPETRATOR),
          change("B", VICTIM, PERPETRATOR),
          change("C", VICTIM, PERPETRATOR),
          change("E", NORMAL, PERPETRATOR)
        )
      );

      // Case 4.2.a
      test(
        "F",
        CONFIRMED,
        merge(
          change("A", PERPETRATOR, VICTIM),
          change("B", PERPETRATOR, VICTIM),
          change("C", PERPETRATOR, VICTIM),
          change("D", PERPETRATOR, VICTIM),
          change("E", PERPETRATOR, VICTIM),
          change("F", NORMAL, PERPETRATOR)
        )
      );

      // Case 4.2.b
      test(
        "F",
        NORMAL,
        merge(
          change("A", VICTIM, PERPETRATOR),
          change("B", VICTIM, PERPETRATOR),
          change("C", VICTIM, PERPETRATOR),
          change("D", VICTIM, PERPETRATOR),
          change("E", VICTIM, PERPETRATOR),
          change("F", PERPETRATOR, NORMAL)
        )
      );

      test(
        "F",
        CONFIRMED,
        merge(
          change("A", PERPETRATOR, VICTIM),
          change("B", PERPETRATOR, VICTIM),
          change("C", PERPETRATOR, VICTIM),
          change("D", PERPETRATOR, VICTIM),
          change("E", PERPETRATOR, VICTIM),
          change("F", NORMAL, PERPETRATOR)
        )
      );

      // Case 4.2.c
      test("A", NORMAL, merge(change("A", VICTIM, NORMAL), change("E", VICTIM, PERPETRATOR)));

      // Case 4.2.d
      test("A", CONFIRMED, merge(change("A", NORMAL, VICTIM), change("E", PERPETRATOR, VICTIM)));
    });

    // Case 4.3
    describe("Two rings with a shared chain (loop A through F + loop EHIJBCDE [BCDE exist in both loops])", () => {
      initialize({
        A: ["B"],
        B: ["C"],
        C: ["D"],
        D: ["E"],
        E: ["F", "H"],
        F: ["G"],
        G: ["A"],
        H: ["I"],
        I: ["J"],
        J: ["B"],
      });

      // Setting first loop as abnormal (A through F)
      test("A", CONFIRMED, change("A", NORMAL, PERPETRATOR));
      test("B", CONFIRMED, merge(change("A", PERPETRATOR, VICTIM), change("B", NORMAL, PERPETRATOR)));
      test("C", CONFIRMED, merge(change("B", PERPETRATOR, VICTIM), change("C", NORMAL, PERPETRATOR)));
      test("D", CONFIRMED, merge(change("C", PERPETRATOR, VICTIM), change("D", NORMAL, PERPETRATOR)));
      test("E", CONFIRMED, merge(change("D", PERPETRATOR, VICTIM), change("E", NORMAL, PERPETRATOR)));
      test("F", CONFIRMED, merge(change("E", PERPETRATOR, VICTIM), change("F", NORMAL, PERPETRATOR)));
      test(
        "G",
        CONFIRMED,
        merge(
          change("A", VICTIM, PERPETRATOR),
          change("B", VICTIM, PERPETRATOR),
          change("C", VICTIM, PERPETRATOR),
          change("D", VICTIM, PERPETRATOR),
          change("E", VICTIM, PERPETRATOR),
          change("G", NORMAL, PERPETRATOR)
        )
      );

      // Setting the other loop as abnormal except H
      test("I", CONFIRMED, change("I", NORMAL, PERPETRATOR));
      test("J", CONFIRMED, merge(change("I", PERPETRATOR, VICTIM), change("J", NORMAL, VICTIM)));

      // Test 4.3.a
      test(
        "H",
        CONFIRMED,
        merge(change("H", NORMAL, PERPETRATOR), change("I", VICTIM, PERPETRATOR), change("J", VICTIM, PERPETRATOR))
      );

      // Test 4.3.b
      test(
        "H",
        NORMAL,
        merge(change("H", PERPETRATOR, NORMAL), change("I", PERPETRATOR, VICTIM), change("J", PERPETRATOR, VICTIM))
      );

      test(
        "H",
        CONFIRMED,
        merge(change("H", NORMAL, PERPETRATOR), change("I", VICTIM, PERPETRATOR), change("J", VICTIM, PERPETRATOR))
      );

      // Test 4.3.c
      test(
        "B",
        NORMAL,
        merge(
          change("B", PERPETRATOR, NORMAL),
          change("C", PERPETRATOR, VICTIM),
          change("D", PERPETRATOR, VICTIM),
          change("E", PERPETRATOR, VICTIM),
          change("F", PERPETRATOR, VICTIM),
          change("G", PERPETRATOR, VICTIM),
          change("H", PERPETRATOR, VICTIM),
          change("I", PERPETRATOR, VICTIM)
        )
      );
      // Test 4.3.d
      test(
        "B",
        CONFIRMED,
        merge(
          change("B", NORMAL, PERPETRATOR),
          change("C", VICTIM, PERPETRATOR),
          change("D", VICTIM, PERPETRATOR),
          change("E", VICTIM, PERPETRATOR),
          change("F", VICTIM, PERPETRATOR),
          change("G", VICTIM, PERPETRATOR),
          change("H", VICTIM, PERPETRATOR),
          change("I", VICTIM, PERPETRATOR)
        )
      );

      // Test 4.3.e
      test(
        "D",
        NORMAL,
        merge(
          change("D", PERPETRATOR, NORMAL),
          change("A", PERPETRATOR, VICTIM),
          change("B", PERPETRATOR, VICTIM),
          change("E", PERPETRATOR, VICTIM),
          change("F", PERPETRATOR, VICTIM),
          change("G", PERPETRATOR, VICTIM),
          change("H", PERPETRATOR, VICTIM),
          change("I", PERPETRATOR, VICTIM),
          change("J", PERPETRATOR, VICTIM)
        )
      );

      // Test 4.3.f
      test(
        "D",
        CONFIRMED,
        merge(
          change("D", NORMAL, PERPETRATOR),
          change("A", VICTIM, PERPETRATOR),
          change("B", VICTIM, PERPETRATOR),
          change("E", VICTIM, PERPETRATOR),
          change("F", VICTIM, PERPETRATOR),
          change("G", VICTIM, PERPETRATOR),
          change("H", VICTIM, PERPETRATOR),
          change("I", VICTIM, PERPETRATOR),
          change("J", VICTIM, PERPETRATOR)
        )
      );
    });
  });

  // ---

  function initialize(graph: Dictionary<string[]>): void {
    _testCounter = 0;
    beforeAll(async () => {
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
    });
  }

  function test(
    id: string,
    status: ComponentStatus,
    expectedChanges: Dictionary<graphService.Change>,
    debug?: boolean
  ): void {
    describe(`[${++_testCounter}] and ${id} becomes ${status}`, () => {
      let changes;
      beforeAll(async () => (changes = await graphService.updateComponentStatus(id, status)));
      it(`should return the expected changes`, () => {
        expect(changes).toEqual(expectedChanges);
      });
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
