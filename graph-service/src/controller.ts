import { Request, Response } from "express";
import { Status } from "./Graph";
import * as service from "./service";
import { logger } from "helpers";

interface Body<T> extends Request {
  body: T;
}

interface ComponentBody {
  component: string;
}

interface UpdateStatusBody {
  component: string;
  status: Status;
}

export async function addComponentsAndDependencies(req: Body<service.ComponentCall[]>, res: Response): Promise<void> {
  req.body.map(async (component: service.ComponentCall) => await service.add(component));
  res.status(201).send();
}

export async function getGraphAsJson(_: Request, res: Response): Promise<void> {
  const result = await service.toPlainObject();
  logger.debug(`Got result ${JSON.stringify(result, null, 4)}`);
  res.json(result);
}

export function searchComponent(req: Body<ComponentBody>, res: Response): void {
  const component = service.getPlain(req.body.component);
  res.json(component);
}

export function findRootCauses(req: Body<ComponentBody>, res: Response): void {
  const causes = service.findRootCauses(req.body.component);
  res.json(causes);
}

export function updateComponentStatus(req: Body<UpdateStatusBody>, res: Response): void {
  const { component, status } = req.body;
  service.updateComponentStatus(component, status);
  res.status(200).send();
}
