import * as redisMock from "redis-mock";
import { promisifyAll } from "bluebird";
import { redis, ComponentStatus, ComponentPlainObject } from "helpers";

promisifyAll(redisMock.RedisClient.prototype);
promisifyAll(redisMock.Multi.prototype);

const mock = jest.spyOn(redis, "createClient").mockImplementation((...args: any) => redisMock.createClient(...args));

import * as httpErrors from "http-errors";
import { forEach, mapValues } from "lodash";
import * as service from "./service";

describe("service", () => {
  beforeEach(service.clear);
  beforeEach(() => mock.mockClear());

  describe("a complete case", () => {
    let toAdd;
    let expected;

    beforeEach(async () => {
      toAdd = [
        { caller: "Alice", callee: "Bob" },
        { caller: "Carl" },
        { callee: "David" },
        { caller: "Alice", callee: "Eric" },
        { caller: "Eric", callee: "Bob" }
      ];

      expected = mapValues(
        {
          Alice: { dependencies: ["Bob", "Eric"], consumers: [], status: ComponentStatus.NORMAL },
          Bob: { dependencies: [], consumers: ["Alice", "Eric"], status: ComponentStatus.NORMAL },
          Carl: { dependencies: [], consumers: [], status: ComponentStatus.NORMAL },
          David: { dependencies: [], consumers: [], status: ComponentStatus.NORMAL },
          Eric: { dependencies: ["Bob"], consumers: ["Alice"], status: ComponentStatus.NORMAL }
        },
        (component: any) =>
          Object.assign(component, { metrics: { throughput: 0, meanResponseTimeMs: 0, errorRate: 0 } })
      );

      toAdd.forEach(async (componentCall: any) => await service.add(componentCall));
    });

    it("should deep equal the expected graph", async () => {
      const result = await service.toPlainObject();
      expect(result).toEqual(expected);
    });
  });

  describe("#search", () => {
    const existingId = "ExistingComponent";
    const missingId = "MissingComponent";

    beforeEach(() => {
      service.add({ callee: existingId });
    });

    describe("when getting a component that does exist", () => {
      it("should return the component", async () => {
        const component = await service.search(existingId);
        expect(component).toEqual({
          id: existingId,
          dependencies: [],
          consumers: [],
          status: ComponentStatus.NORMAL,
          metrics: {
            // all metrics will be empty because the test does not set any particular values
            errorRate: 0,
            meanResponseTimeMs: 0,
            throughput: 0
          }
        });
      });
    });

    describe("when trying to get a component that does not exist", () => {
      it("should throw a NotFound error", async () => {
        expect.assertions(1);
        await expect(service.search(missingId)).rejects.toBeInstanceOf(httpErrors.NotFound);
      });
    });
  });

  describe("#findRootCauses", () => {
    interface GraphPlainPartialObject {
      graph: {
        [id: string]: { dependencies?: string[]; status?: ComponentStatus };
      };
    }
    function findRootCauseTest(
      initialId: string,
      expected: string[] | httpErrors.HttpErrorConstructor,
      state: GraphPlainPartialObject
    ): void {
      it("should yield the expected root causes", () => {
        // test-case setup
        forEach(state.graph, ({ dependencies, status }: ComponentPlainObject, id: string) => {
          service.add({ callee: id }); // insert component even if there are no deps
          service.updateComponentStatus(id, status || ComponentStatus.NORMAL); // set status
          for (const depId of dependencies || []) {
            // insert dependencies (if there are some)
            service.add({ caller: id, callee: depId });
          }
        });

        if (Array.isArray(expected)) {
          const rootIds = service
            .findRootCauses(initialId)
            .map((component: ComponentPlainObject) => component.id)
            .sort();

          expect(rootIds).toEqual(expected.sort());
        } else {
          expect(() => service.findRootCauses(initialId)).toThrowError(expected);
        }
      });
    }

    describe("when the initial component does not exist", () =>
      findRootCauseTest("Z", httpErrors.NotFound, { graph: {} }));

    describe("when the initial component exists and is healthy", () =>
      findRootCauseTest("Alice", [], { graph: { Alice: {} } }));

    describe("when the initial component exists and is anomalous", () => {
      const state: any = {
        graph: {}
      };

      beforeEach(() => {
        state.graph = {
          Alice: { status: ComponentStatus.CONFIRMED }
        };
      });

      describe("and it has no dependencies", () => findRootCauseTest("Alice", ["Alice"], state));

      describe("and it has all healthy dependencies", () => {
        beforeEach(() => {
          state.graph.Alice.dependencies = ["Bob", "Carl"];
        });

        findRootCauseTest("Alice", ["Alice"], state);
      });

      describe("and it has some broken dependencies", () => {
        beforeEach(() => {
          state.graph = {
            Alice: {
              status: ComponentStatus.CONFIRMED,
              dependencies: ["Bob", "Carl", "David"]
            },
            Bob: { status: ComponentStatus.CONFIRMED },
            Carl: {},
            David: { status: ComponentStatus.CONFIRMED }
          };
        });

        describe("and none of them have broken dependencies", () =>
          findRootCauseTest("Alice", ["Bob", "David"], state));

        describe("and some of them have broken dependencies", () => {
          beforeEach(() => {
            state.graph.Eric = { status: ComponentStatus.CONFIRMED };
            state.graph.David.dependencies = ["Eric"];
          });

          findRootCauseTest("Alice", ["Bob", "Eric"], state);
        });

        describe("and there is a cycle in the anomalous chain", () => {
          describe("with a hanging tail at the beginning", () => {
            beforeEach(() => {
              // B is the hanging tail off of A in the loop A - D - A
              state.graph.David.dependencies = ["Alice"];
            });

            findRootCauseTest("Alice", ["Alice", "Bob", "David"], state);
          });

          describe("with a hanging tail in the middle", () => {
            beforeEach(() => {
              // F is a hanging tail off of D, the loop is A - D - E - A
              state.graph.David.dependencies = ["Eric", "Fred"];
              state.graph.Eric = {
                status: ComponentStatus.CONFIRMED,
                dependencies: ["Alice"]
              };
              state.graph.Fred = {
                status: ComponentStatus.CONFIRMED
              };
            });

            findRootCauseTest("Alice", ["Bob", "David", "Eric", "Alice", "Fred"], state);
          });
          describe("with a hanging tail at the end", () => {
            beforeEach(() => {
              // E is a hanging tail off of D in the loop A - D - A
              state.graph.Eric = { status: ComponentStatus.CONFIRMED };
              state.graph.David.dependencies = ["Eric", "Alice"];
            });

            findRootCauseTest("Alice", ["Bob", "David", "Eric", "Alice"], state);
          });
        });
      });
    });
  });
});
