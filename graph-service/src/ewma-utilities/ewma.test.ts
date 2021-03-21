import { EWMA, EWMAStdDeviation } from "./ewma";

describe("EWMA helpers", () => {
  describe("stdDeviation", () => {
    let result: number;

    const values = [
      52.0,
      47.0,
      53.0,
      49.3,
      50.1,
      47.0,
      51.0,
      50.1,
      51.2,
      50.5,
      49.6,
      47.6,
      49.9,
      51.3,
      47.8,
      51.2,
      52.6,
      52.4,
      53.6,
      52.1,
    ];

    beforeAll(() => {
      let lastEWMA = 50;
      let lastEWMASquare = Math.pow(50, 2);

      // tslint:disable-next-line:prefer-for-of
      for (let index = 0; index < values.length; index++) {
        lastEWMA = EWMA(values[index], lastEWMA);
        lastEWMASquare = EWMA(Math.pow(values[index], 2), lastEWMASquare);
      }

      result = EWMAStdDeviation(lastEWMASquare, lastEWMA);
    });

    it("should return approx 1.790", () => {
      expect(result).toBeCloseTo(1.79);
    });
  });
});
