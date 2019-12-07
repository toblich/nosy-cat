import { ComponentStatus } from "./types";

export const status = { isAnomalous, isNormal, hasChanged };

function isAnomalous(s: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.VICTIM, ComponentStatus.PERPETRATOR].includes(s);
}

function isNormal(s: ComponentStatus): boolean {
  return !isAnomalous(s);
}

function hasChanged(oldStatus: ComponentStatus, newStatus: ComponentStatus): boolean {
  return isNormal(oldStatus) !== isNormal(newStatus);
}
