import { Response } from "express";
import { logger, ComponentIdReq, UpdateComponentStatusReq, AddComponentsReq, EmptyReq } from "helpers";
import * as service from "./service";

// ---

export async function addComponentsAndDependencies(req: AddComponentsReq, res: Response): Promise<void> {
  await service.add(req.body);
  res.status(201).send();
}

export async function getGraphAsJson(_: EmptyReq, res: Response): Promise<void> {
  const result = await service.getFullGraph();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  res.json(result);
}

export async function searchComponent(req: ComponentIdReq, res: Response): Promise<void> {
  const component = await service.search(req.body.component);
  res.json(component);
}

export async function updateComponentStatus(req: UpdateComponentStatusReq, res: Response): Promise<void> {
  const { component, status } = req.body;
  const changes = await service.updateComponentStatus(component, status);
  res.status(200).json(changes);
}

export async function resetGraph(_: EmptyReq, res: Response): Promise<void> {
  await service.clear();
  res.status(204).send();
}
