import { InfluxDB, Point, WriteApi, setLogger } from "@influxdata/influxdb-client";
import { ComponentHistoricMetrics, HistoricMetric, logger } from "helpers";

const ACCEPTED_STD_DEVIATIONS = parseInt(process.env.ACCEPTED_STD_DEVIATIONS, 10);

interface MetricsRepository {
  writeBatch(_: ComponentHistoricMetrics[]): void;
}

class InfluxRepository implements MetricsRepository {
  private influxWriter: WriteApi;
  private buffer: ComponentHistoricMetrics[];

  constructor() {
    setLogger(logger);
    this.initialize();
  }

  private async initialize(): Promise<void> {
    this.influxWriter = null;
    this.buffer = [];

    const token = await this.fetchToken();

    this.influxWriter = new InfluxDB({
      url: process.env.INFLUX_URL,
      token,
    }).getWriteApi("nosy-cat", "default", "ms", {
      writeFailed: (error: Error, lines: string[], attempt: number) => {
        logger.error(`There was an error writing to Influx: ${error.stack}`);
        if (attempt > 2) {
          // Assume that the error could be related to the token or the connection.
          // Re-initialize without losing the data.
          // It's important that this is done async and we do not return a Promise
          // (https://github.com/influxdata/influxdb-client-js/blob/7fa92f1603b47576d84010d32b712481633ccf61/packages/core/src/options.ts#L47-L50)
          this.initialize().then(() => this.influxWriter.writeRecords(lines));
        }
      },
      writeSuccess: (lines: string[]) => {
        logger.info(`Successfully wrote ${lines.length} lines to Influx :)`);
      },
      flushInterval: parseInt(process.env.INFLUX_FLUSH_INTERVAL_MS || "60000", 10),
    });
    this.writeBatch(this.buffer);
  }

  private async fetchToken(): Promise<string> {
    if (!process.env.INFLUX_TOKEN_FILEPATH) {
      throw new Error("The path for the file with the influx token is unspecified.");
    }

    let tokenFile;
    try {
      tokenFile = require(process.env.INFLUX_TOKEN_FILEPATH);
    } catch {
      logger.warn(`There was an error requiring the influx token file (${process.env.INFLUX_TOKEN_FILEPATH})`);
    }

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
        .floatField("observed", latest)
        .floatField("historicAvg", historicAvg)
        .floatField("historicStdDev", historicStdDev)
        .floatField("lowerThreshold", historicAvg - ACCEPTED_STD_DEVIATIONS * historicStdDev)
        .floatField("upperThreshold", historicAvg + ACCEPTED_STD_DEVIATIONS * historicStdDev)
        .timestamp(timestampMs)
    );
  }
}

class NoopRepository implements MetricsRepository {
  constructor() {} // tslint:disable-line no-empty
  public writeBatch(_: ComponentHistoricMetrics[]): void {} // tslint:disable-line no-empty
}

export default process.env.USE_INFLUX === "true" ? InfluxRepository : NoopRepository;
