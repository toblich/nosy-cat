import { InfluxDB, Point, WriteApi } from "@influxdata/influxdb-client";
import { ComponentHistoricMetrics, HistoricMetric, logger } from "helpers";

const ACCEPTED_STD_DEVIATIONS = parseInt(process.env.ACCEPTED_STD_DEVIATIONS, 10);

export default class InfluxRepository {
  private influxWriter: WriteApi;
  private buffer: ComponentHistoricMetrics[];

  constructor() {
    this.buffer = [];
    this.initialize();
  }

  private async initialize(): Promise<void> {
    const token = await this.fetchToken();
    this.influxWriter = new InfluxDB({
      url: process.env.INFLUX_URL,
      token,
    }).getWriteApi("nosy-cat", "default", "ms", {
      writeFailed: (error: Error, lines: string[], attempt: number) => {
        logger.error(`There was an error writing to Influx: ${error.stack}`);
      },
      writeSuccess: (lines: string[]) => {
        logger.debug(`Successfully wrote ${lines.length} lines to Influx :)`);
      },
      flushInterval: parseInt(process.env.INFLUX_FLUSH_INTERVAL_MS, 10),
    });
    this.writeBatch(this.buffer);
  }

  private async fetchToken(): Promise<string> {
    if (!process.env.INFLUX_TOKEN_FILEPATH) {
      throw new Error("The path for the file with the influx token is unspecified.");
    }
    const tokenFile = require(process.env.INFLUX_TOKEN_FILEPATH);
    if (tokenFile && tokenFile.influx) {
      logger.info("Successfully got influx token");
      return tokenFile.influx;
    }

    // Sleep for a moment and retry
    logger.warn(`Failed to fetch the influx token. Retrying...`);
    await new Promise((resolve: (value: number) => void) => setTimeout(resolve, 1000));
    this.fetchToken();
  }

  public writeBatch(batch: ComponentHistoricMetrics[]): void {
    if (!this.influxWriter) {
      // If still initializing, buffer metrics
      this.buffer.push(...batch);
      return;
    }
    const points = batch.flatMap(this.toPoint);
    this.influxWriter.writePoints(points);
  }

  private toPoint(componentHistoricMetric: ComponentHistoricMetrics): Point[] {
    const { component, metrics } = componentHistoricMetric;
    return metrics.map(({ name, latest, historicAvg, historicStdDev, timestampMs }: HistoricMetric) =>
      new Point(name)
        .tag("component", component)
        .floatField("value", latest)
        .floatField("historicAvg", historicAvg)
        .floatField("historicStdDev", historicStdDev)
        .floatField("lowerThreshold", historicAvg - ACCEPTED_STD_DEVIATIONS * historicStdDev)
        .floatField("upperThreshold", historicAvg + ACCEPTED_STD_DEVIATIONS * historicStdDev)
        .timestamp(timestampMs)
    );
  }
}
