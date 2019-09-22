import * as service from "./service";
import { logger } from "helpers";

// tslint:disable-next-line: typedef
export function addComponentsAndDependencies(req, res, next) {
  logger.info(`body: ${JSON.stringify(req.body)}`);
  try {
    req.body.map(service.add);
  } catch (e) {
    return next(e);
  }

  res.status(201).send();
}

// tslint:disable-next-line: typedef
export function getGraphAsJson(_, res) {
  res.json(service.toPlainObject());
}

// tslint:disable-next-line: typedef
export function searchComponent(req, res, next) {
  let component;
  try {
    component = service.getPlain(req.body.component);
  } catch (e) {
    return next(e);
  }

  res.json(component);
}
