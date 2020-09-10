import { ComponentStatus } from "helpers";

function isStatusConfirmedAnomalous(componentStatus: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.PERPETRATOR, ComponentStatus.VICTIM].includes(componentStatus);
}
function isStatusAnomalous(componentStatus: ComponentStatus): boolean {
  return [
    ComponentStatus.CONFIRMED,
    ComponentStatus.PERPETRATOR,
    ComponentStatus.VICTIM,
    ComponentStatus.SUSPICIOUS
  ].includes(componentStatus);
}

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

  if (isStatusConfirmedAnomalous(currentStatus) && hasErrored) {
    return { newStatus: currentStatus };
  }

  return {
    newStatus: ComponentStatus.CONFIRMED
  };
}
