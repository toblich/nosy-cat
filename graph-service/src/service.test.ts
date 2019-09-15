import * as httpErrors from "http-errors";
import { forEach } from "lodash";
import * as service from "./service";
import { Status, ComponentPlainObject } from "./Graph";

describe("service", () => {
  beforeEach(service.clear);

  describe("a complete case", () => {
    let toAdd;
    let expected;

    beforeEach(() => {
      toAdd = [
        { caller: "A", callee: "B" },
        { caller: "C" },
        { callee: "D" },
        { caller: "A", callee: "E" },
        { caller: "E", callee: "B" }
      ];

      expected = {
        A: { dependencies: ["B", "E"], status: "OK" },
        B: { dependencies: [], status: "OK" },
        C: { dependencies: [], status: "OK" },
        D: { dependencies: [], status: "OK" },
        E: { dependencies: ["B"], status: "OK" }
      };

      toAdd.forEach(service.add);
    });

    it("should deep equal the expected graph", () => {
      expect(service.toPlainObject()).toEqual(expected);
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
    function findRootCauseTest(initialId: string, expectedIds: string[], state: GraphPlainPartialObject): void {
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

        const rootIds = service
          .findRootCauses(initialId)
          .map((component: ComponentPlainObject) => component.id)
          .sort();

        expect(rootIds).toEqual(expectedIds.sort());
      });
    }

    describe("when the root component does not exist", () => findRootCauseTest("Z", [], { graph: {} }));

    describe("when the root component exists and is healthy", () => findRootCauseTest("A", [], { graph: { A: {} } }));

    describe("when the root component exists and is anomalous", () => {
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
              dependencies: ["B", "C", "D", "E"]
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
      });
    });
  });
});
