import { Response } from "express";
import { logger, ComponentIdReq, UpdateComponentStatusReq, AddComponentsReq, EmptyReq, ComponentCall } from "helpers";
import * as service from "./service";

export async function addComponentsAndDependencies(req: AddComponentsReq, res: Response): Promise<void> {
  await Promise.all(req.body.map((component: ComponentCall) => service.add(component)));
  res.status(201).send();
}

export async function getGraphAsJson(_: EmptyReq, res: Response): Promise<void> {
  const result = await service.toPlainObject();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  res.json(result);
}

export function searchComponent(req: ComponentIdReq, res: Response): void {
  const component = service.getPlain(req.body.component);
  res.json(component);
}

export function findRootCauses(req: ComponentIdReq, res: Response): void {
  const causes = service.findRootCauses(req.body.component);
  res.json(causes);
}

export function updateComponentStatus(req: UpdateComponentStatusReq, res: Response): void {
  const { component, status } = req.body;
  service.updateComponentStatus(component, status);
  res.status(200).send();
}
