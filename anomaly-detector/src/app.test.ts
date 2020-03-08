import * as Helpers from "helpers";

const client: any = {};
const clientMock = jest.spyOn(Helpers, "generateGraphClient").mockImplementationOnce(() => client as any);

import { processComponentCall } from "./app";
import { ComponentStatus } from "helpers";

describe("when processing a component call", () => {
  beforeAll(() => {
    client.updateServiceMetrics = async (): Promise<void> => Promise.resolve();
  });

  afterAll(() => {
    clientMock.mockRestore();
  });

  describe("and the service was anomalous", () => {
    describe("and the service doesn't have errors anymore", () => {
      const service = {
        body: {
          id: "id",
          status: ComponentStatus.CONFIRMED,
          metrics: {
            errorRate: 0.4,
            meanResponseTimeMs: 999,
            throughput: 0.9
          }
        }
      };
      const updateServiceMetrics = jest.fn();

      beforeAll(async () => {
        client.getService = jest.fn().mockResolvedValue(service);
        client.updateServiceMetrics = updateServiceMetrics;

        await processComponentCall(null, { callee: service.body.id });
      });

      it("should mark the service as normal", () => {
        expect(updateServiceMetrics).toHaveBeenCalledWith(service.body.id, ComponentStatus.NORMAL);
      });
    });

    describe("and the service still has errors", () => {
      const service = {
        body: {
          id: "id",
          status: ComponentStatus.CONFIRMED,
          metrics: {
            errorRate: 11.1,
            meanResponseTimeMs: 1400,
            throughput: 0.1
          }
        }
      };
      const updateServiceMetrics = jest.fn();

      beforeAll(async () => {
        client.getService = jest.fn().mockResolvedValue(service);
        client.updateServiceMetrics = updateServiceMetrics;

        await processComponentCall(null, { callee: service.body.id });
      });

      it("should not update anything", () => {
        expect(updateServiceMetrics).not.toHaveBeenCalled();
      });
    });
  });

  describe("and the service wasn't anomalous", () => {
    describe("and the service doesn't have any errors", () => {
      const service = {
        body: {
          id: "id",
          status: ComponentStatus.NORMAL,
          metrics: {
            errorRate: 0.1,
            meanResponseTimeMs: 1000,
            throughput: 1
          }
        }
      };
      const updateServiceMetrics = jest.fn();

      beforeAll(async () => {
        client.getService = jest.fn().mockResolvedValue(service);
        client.updateServiceMetrics = updateServiceMetrics;

        await processComponentCall(null, { callee: service.body.id });
      });

      it("should not update anything", () => {
        expect(updateServiceMetrics).not.toHaveBeenCalled();
      });
    });

    describe("and the service has errors", () => {
      const service = {
        body: {
          id: "id",
          status: ComponentStatus.NORMAL,
          metrics: {
            errorRate: 10.1,
            meanResponseTimeMs: 1000,
            throughput: 1
          }
        }
      };
      const updateServiceMetrics = jest.fn().mockImplementation(async () => ({
        body: { id: { to: { status: "any-status" } } }
      }));

      beforeAll(async () => {
        client.getService = jest.fn().mockResolvedValue(service);
        client.updateServiceMetrics = updateServiceMetrics;

        await processComponentCall(null, { callee: service.body.id });
      });

      it("should update the service with Confirmed status", () => {
        expect(updateServiceMetrics).toHaveBeenCalledWith(service.body.id, ComponentStatus.CONFIRMED);
      });
    });
  });
});
