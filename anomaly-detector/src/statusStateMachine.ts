import { ComponentStatus } from "helpers";

const MAX_CONFIRMED_COUNT = 3;
const MAX_HEALED_COUNT = 3;

function isStatusHealthy(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.NORMAL, ComponentStatus.SUSPICIOUS].includes(componentStatus);
}

function isStatusConfirmedHealthy(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.NORMAL].includes(componentStatus);
}

function isStatusConfirmedAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}

function isStatusAnomalous(componentStatus: ComponentStatus): boolean {
  return [
    ComponentStatus.CONFIRMED,
    ComponentStatus.PERPETRATOR,
    ComponentStatus.VICTIM,
    ComponentStatus.HEALING
  ].includes(componentStatus);
}

//  NORMAL = "NORMAL",
// SUSPICIOUS = "SUSPICIOUS",
// CONFIRMED = "CONFIRMED",
// VICTIM = "VICTIM",
// PERPETRATOR = "PERPETRATOR",
// HEALING = "HEALING"
export function getNewStatus(
  currentStatus: ComponentStatus,
  statusOccurrences: number,
  hasErrored: boolean
): { newStatus: ComponentStatus } {
  if (currentStatus === ComponentStatus.NORMAL && !hasErrored) {
    return { newStatus: ComponentStatus.NORMAL };
  }

  if (isStatusConfirmedAnomalous(currentStatus) && hasErrored) {
    return { newStatus: currentStatus };
  }

  if (isStatusHealthy(currentStatus) && hasErrored) {
    if (currentStatus === ComponentStatus.NORMAL) {
      return { newStatus: ComponentStatus.SUSPICIOUS };
    }

    if (statusOccurrences + 1 < MAX_CONFIRMED_COUNT) {
      // TODO: increase status occurrences
      return { newStatus: currentStatus };
    }

    // TODO: calculate confirmed status
    return { newStatus: ComponentStatus.CONFIRMED };
  }

  if (isStatusConfirmedAnomalous(currentStatus) && !hasErrored) {
    if (currentStatus !== ComponentStatus.HEALING) {
      return { newStatus: ComponentStatus.HEALING };
    }

    if (statusOccurrences + 1 < CONFIRMED_COUNT) {
      // TODO: increase status occurrences
      return { newStatus: currentStatus };
    }

    // TODO: calculate confirmed status
    return { newStatus: ComponentStatus.CONFIRMED };
  }

  return {
    newStatus: ComponentStatus.CONFIRMED
  };
}

interface StateResponse {
  status: ComponentStatus;
  occurrences: number;
}

const stateMap = {
  [ComponentStatus.NORMAL]: {
    events: {
      error: (): StateResponse => ({
        status: ComponentStatus.SUSPICIOUS,
        occurrences: 0
      }),
      normal: (): StateResponse => ({ status: ComponentStatus.NORMAL, occurrences: 0 })
    }
  },
  [ComponentStatus.SUSPICIOUS]: {
    events: {
      error: (occurrences: number): StateResponse =>
        occurrences + 1 < MAX_CONFIRMED_COUNT
          ? {
              status: ComponentStatus.SUSPICIOUS,
              occurrences: occurrences + 1
            }
          : {
              status: ComponentStatus.CONFIRMED,
              occurrences: 0
            },
      normal: (): StateResponse => ({ status: ComponentStatus.NORMAL, occurrences: 0 })
    }
  },
  [ComponentStatus.CONFIRMED]: anomalousState(ComponentStatus.CONFIRMED),
  [ComponentStatus.VICTIM]: anomalousState(ComponentStatus.VICTIM),
  [ComponentStatus.PERPETRATOR]: anomalousState(ComponentStatus.PERPETRATOR),
  [ComponentStatus.HEALING]: {
    events: {
      error: {},
      normal: (occurrences: number): StateResponse =>
        occurrences + 1 < MAX_HEALED_COUNT
          ? {
              status: ComponentStatus.HEALING,
              occurrences: occurrences + 1
            }
          : {
              status: ComponentStatus.NORMAL,
              occurrences: 0
            }
    }
  }
};

function anomalousState(status: ComponentStatus): any {
  return {
    events: {
      error: (): StateResponse => ({ status, occurrences: 0 }),
      normal: (): StateResponse => ({
        status: ComponentStatus.HEALING,
        occurrences: 0
      })
    }
  };
}

// ----

interface ComponentHistoricMetrics {
  component: string;
  metrics: HistoricMetric[];
}

export interface HistoricMetric {
  name: string;
  latest: number;
  historicAvg: number;
  historicStdDev: number;
}
