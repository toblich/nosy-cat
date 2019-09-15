import { Request, Response, NextFunction } from "express";
import { Status } from "./Graph";
import * as service from "./service";

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

export function addComponentsAndDependencies(req: Body<service.ComponentCall[]>, res: Response): void {
  req.body.map(service.add);
  res.status(201).send();
}

export function getGraphAsJson(_: Request, res: Response): void {
  res.json(service.toPlainObject());
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
