import { ComponentStatus } from "./types";

const anomalousStates = new Set([ComponentStatus.CONFIRMED, ComponentStatus.VICTIM, ComponentStatus.PERPETRATOR]);

function isAnomalous(s: ComponentStatus): boolean {
  return anomalousStates.has(s);
}
const abnormalStatusMappings = `${Array.from(anomalousStates)
  .map((s: string) => `WHEN "${s}" then "Abnormal"`)
  .join("\n")}`;

function isAnomalousCypher(statusVarName: string): string {
  return `
    CASE ${statusVarName}
      ${abnormalStatusMappings}
      ELSE "${ComponentStatus.NORMAL}"
    END
  `;
}

function isNormal(s: ComponentStatus): boolean {
  return !isAnomalous(s);
}

function hasChanged(oldStatus: ComponentStatus, newStatus: ComponentStatus): boolean {
  return isNormal(oldStatus) !== isNormal(newStatus);
}

function statusStateMachine(statusVarName: string, incomingStatus: ComponentStatus): string {
  return "";
}

export const status = { isAnomalous, isNormal, hasChanged, isAnomalousCypher };
