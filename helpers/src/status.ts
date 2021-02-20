import { ComponentStatus } from "./types";

function isAnomalous(s: ComponentStatus): boolean {
  return [ComponentStatus.CONFIRMED, ComponentStatus.VICTIM, ComponentStatus.PERPETRATOR].includes(s);
}

const isAnomalousCypher = `
  CASE callee.status
  WHEN "CONFIRMED" THEN "Abnormal"
  WHEN "VICTIM" THEN "Abnormal"
  WHEN "PERPETRATOR" THEN "Abnormal"
  ELSE "${ComponentStatus.NORMAL}"
  END
`;

function isNormal(s: ComponentStatus): boolean {
  return !isAnomalous(s);
}

function hasChanged(oldStatus: ComponentStatus, newStatus: ComponentStatus): boolean {
  return isNormal(oldStatus) !== isNormal(newStatus);
}

export const status = { isAnomalous, isNormal, hasChanged, isAnomalousCypher };
