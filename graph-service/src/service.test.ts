import * as httpErrors from "http-errors";
import * as service from "./service";
import { Status } from "./Graph";

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

  describe("getPlain", () => {
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
});
