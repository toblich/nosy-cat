const GAMMA = parseFloat(process.env.GAMMA || "0.0003");

/**
 * Calculates the EWMA at a time T, given the EWMA value at time T - 1 and the measure at time T
 * Formula based on https://www.itl.nist.gov/div898/handbook/pmc/section3/pmc324.htm
 *
 * @param Yt - Measure at time T
 * @param previousEWMA - EWMA at time T - 1
 */
export function EWMA(Yt: number, previousEWMA: number, gamma: number = GAMMA): number {
  return gamma * Yt + previousEWMA * (1 - gamma);
}

/**
 * Calculates the standard deviation for an EWMA at a given time T
 * Applying the function sqrt(EWMA(Y^2) + (EWMA(Y))^2)
 *
 * @param Yt - Measure at time T
 * @param previousEWMA  - EWMA at time T - 1
 */
export function EWMAStdDeviation(EWMASquare: number, EWMAValue: number): number {
  const result = Math.sqrt(EWMASquare - Math.pow(EWMAValue, 2));

  return result;
}
