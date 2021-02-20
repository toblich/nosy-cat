import { Response } from "express";
import {
  logger,
  ComponentIdReq,
  UpdateComponentStatusReq,
  AddComponentsReq,
  EmptyReq,
  ComponentCall,
  UIGraph,
} from "helpers";
import * as service from "./service"; // TODO this is legacy (demo 1)
import * as graphService from "./graphService";

// ---

export async function addComponentsAndDependencies(req: AddComponentsReq, res: Response): Promise<void> {
  // await Promise.all(req.body.map((component: ComponentCall) => service.add(component)));
  await graphService.add(req.body);
  res.status(201).send();
}

export async function getGraphAsJson(_: EmptyReq, res: Response): Promise<void> {
  const result = await graphService.getFullGraph();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  res.json(result);
}

export async function getGraphAsNodesAndEdges(_: EmptyReq, res: Response): Promise<void> {
  const result = await service.toUIObject();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  res.json(result);
}

export async function wsGraphAsNodesAndEdges(): Promise<UIGraph> {
  const result = await service.toUIObject();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  return result;
}

export async function searchComponent(req: ComponentIdReq, res: Response): Promise<void> {
  const component = await graphService.search(req.body.component);
  res.json(component);
}

export async function findRootCauses(req: ComponentIdReq, res: Response): Promise<void> {
  const causes = await graphService.findRootCauses(req.body.component);
  res.json(causes);
}

export async function updateComponentStatus(req: UpdateComponentStatusReq, res: Response): Promise<void> {
  const { component, status } = req.body;
  // const changes = await service.updateComponentStatus(component, status);
  const changes = await graphService.updateComponentStatus(component, status);
  res.status(200).json(changes);
}

export async function resetGraph(req: EmptyReq, res: Response): Promise<void> {
  // await service.clear();
  await graphService.clear();
  res.status(204).send();
}
