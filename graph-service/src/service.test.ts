import * as service from "./service";

test("service", () => {
  const toAdd = [
    { caller: "A", callee: "B" },
    { caller: "C" },
    { callee: "D" },
    { caller: "A", callee: "E" },
    { caller: "E", callee: "B" }
  ];

  const expected = {
    A: { dependencies: ["B", "E"], status: "OK" },
    B: { dependencies: [], status: "OK" },
    C: { dependencies: [], status: "OK" },
    D: { dependencies: [], status: "OK" },
    E: { dependencies: ["B"], status: "OK" }
  };

  service.clear();

  toAdd.forEach(service.add);
  expect(service.toPlainObject()).toEqual(expected);
});
