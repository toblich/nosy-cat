import { ComponentStatus } from "helpers";

const MAX_CONFIRMED_COUNT = 3;
const MAX_HEALED_COUNT = 3;

export function getNewStatus(
  currentStatus: ComponentStatus,
  statusOccurrences: number,
  hasErrored: boolean
): StateResponse {
  const method = hasErrored ? "error" : "normal";
  return stateMap[currentStatus].events[method](statusOccurrences);
}

interface StateResponse {
  status: ComponentStatus;
  occurrences: number;
}

const stateMap = {
  [ComponentStatus.NORMAL]: {
    events: {
      error: (_: number): StateResponse => ({
        status: ComponentStatus.SUSPICIOUS,
        occurrences: 0,
      }),
      normal: (_: number): StateResponse => ({ status: ComponentStatus.NORMAL, occurrences: 0 }),
    },
  },
  [ComponentStatus.SUSPICIOUS]: {
    events: {
      error: (occurrences: number): StateResponse =>
        occurrences + 1 < MAX_CONFIRMED_COUNT
          ? {
              status: ComponentStatus.SUSPICIOUS,
              occurrences: occurrences + 1,
            }
          : {
              status: ComponentStatus.CONFIRMED,
              occurrences: 0,
            },
      normal: (): StateResponse => ({ status: ComponentStatus.NORMAL, occurrences: 0 }),
    },
  },
  [ComponentStatus.CONFIRMED]: anomalousState(ComponentStatus.CONFIRMED),
  [ComponentStatus.VICTIM]: anomalousState(ComponentStatus.VICTIM),
  [ComponentStatus.PERPETRATOR]: anomalousState(ComponentStatus.PERPETRATOR),
  [ComponentStatus.HEALING]: {
    events: {
      error: (): StateResponse => ({ status: ComponentStatus.CONFIRMED, occurrences: 0 }),
      normal: (occurrences: number): StateResponse =>
        occurrences + 1 < MAX_HEALED_COUNT
          ? {
              status: ComponentStatus.HEALING,
              occurrences: occurrences + 1,
            }
          : {
              status: ComponentStatus.NORMAL,
              occurrences: 0,
            },
    },
  },
};

function anomalousState(
  status: ComponentStatus
): { events: { error: (_: number) => StateResponse; normal: () => StateResponse } } {
  return {
    events: {
      error: (_: number): StateResponse => ({ status, occurrences: 0 }),
      normal: (): StateResponse => ({
        status: ComponentStatus.HEALING,
        occurrences: 0,
      }),
    },
  };
}
