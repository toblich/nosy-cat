import * as redisMock from "redis-mock";
import { promisifyAll } from "bluebird";
import { redis } from "helpers";

promisifyAll(redisMock.RedisClient.prototype);
promisifyAll(redisMock.Multi.prototype);

const mock = jest.spyOn(redis, "createClient").mockImplementation((...args: any) => redisMock.createClient(...args));

import * as httpErrors from "http-errors";
import { forEach, mapValues } from "lodash";
import * as service from "./service";
import { Status, ComponentPlainObject } from "./Graph";

describe("service", () => {
  beforeEach(service.clear);
  beforeEach(() => mock.mockClear());

  describe("a complete case", () => {
    let toAdd;
    let expected;

    beforeEach(async () => {
      toAdd = [
        { caller: "A", callee: "B" },
        { caller: "C" },
        { callee: "D" },
        { caller: "A", callee: "E" },
        { caller: "E", callee: "B" }
      ];

      expected = mapValues(
        {
          A: { dependencies: ["B", "E"], status: "OK" },
          B: { dependencies: [], status: "OK" },
          C: { dependencies: [], status: "OK" },
          D: { dependencies: [], status: "OK" },
          E: { dependencies: ["B"], status: "OK" }
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

  describe("#getPlain", () => {
    const existingId = "ExistingComponent";
    const missingId = "MissingComponent";

    beforeEach(() => {
      service.add({ caller: existingId });
    });

    describe("when getting a component that does exist", () => {
      it("should return the component", () => {
        const component = service.getPlain(existingId);
        expect(component).toEqual({
          id: existingId,
          dependencies: [],
          status: Status.OK
        });
      });
    });

    describe("when trying to get a component that does not exist", () => {
      it("should throw a NotFound error", () => {
        expect(() => service.getPlain(missingId)).toThrow(httpErrors.NotFound);
      });
    });
  });

  describe("#findRootCauses", () => {
    interface GraphPlainPartialObject {
      graph: {
        [id: string]: { dependencies?: string[]; status?: Status };
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
          service.add({ caller: id }); // insert component even if there are no deps
          service.updateComponentStatus(id, status || Status.OK); // set status
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
      findRootCauseTest("A", [], { graph: { A: {} } }));

    describe("when the initial component exists and is anomalous", () => {
      const state: any = {
        graph: {}
      };

      beforeEach(() => {
        state.graph = {
          A: { status: Status.ANOMALOUS }
        };
      });

      describe("and it has no dependencies", () => findRootCauseTest("A", ["A"], state));

      describe("and it has all healthy dependencies", () => {
        beforeEach(() => {
          state.graph.A.dependencies = ["B", "C"];
        });

        findRootCauseTest("A", ["A"], state);
      });

      describe("and it has some broken dependencies", () => {
        beforeEach(() => {
          state.graph = {
            A: {
              status: Status.ANOMALOUS,
              dependencies: ["B", "C", "D"]
            },
            B: { status: Status.ANOMALOUS },
            C: {},
            D: { status: Status.ANOMALOUS }
          };
        });

        describe("and none of them have broken dependencies", () => findRootCauseTest("A", ["B", "D"], state));

        describe("and some of them have broken dependencies", () => {
          beforeEach(() => {
            state.graph.E = { status: Status.ANOMALOUS };
            state.graph.D.dependencies = ["E"];
          });

          findRootCauseTest("A", ["B", "E"], state);
        });

        describe("and there is a cycle in the anomalous chain", () => {
          describe("with a hanging tail at the beginning", () => {
            beforeEach(() => {
              // B is the hanging tail off of A in the loop A - D - A
              state.graph.D.dependencies = ["A"];
            });

            findRootCauseTest("A", ["A", "B", "D"], state);
          });

          describe("with a hanging tail in the middle", () => {
            beforeEach(() => {
              // F is a hanging tail off of D, the loop is A - D - E - A
              state.graph.D.dependencies = ["E", "F"];
              state.graph.E = {
                status: Status.ANOMALOUS,
                dependencies: ["A"]
              };
              state.graph.F = {
                status: Status.ANOMALOUS
              };
            });

            findRootCauseTest("A", ["B", "D", "E", "A", "F"], state);
          });
          describe("with a hanging tail at the end", () => {
            beforeEach(() => {
              // E is a hanging tail off of D in the loop A - D - A
              state.graph.E = { status: Status.ANOMALOUS };
              state.graph.D.dependencies = ["E", "A"];
            });

            findRootCauseTest("A", ["B", "D", "E", "A"], state);
          });
        });
      });
    });
  });
});
