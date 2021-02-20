import * as winston from "winston";

//
// Logging levels
//
const config = {
  levels: {
    error: 0,
    warn: 1,
    data: 2,
    info: 3,
    verbose: 4,
    debug: 5,
    silly: 6,
  },
  colors: {
    error: "bold red",
    debug: "blue",
    warn: "bold yellow",
    data: "grey",
    info: "bold green",
    verbose: "magenta",
    silly: "dim magenta",
  },
};

winston.addColors(config.colors);

const logger = winston.createLogger({
  levels: config.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf((info: winston.LogEntry) => `${info.timestamp} - ${info.level}: ${info.message}`)
  ),
  transports: [new winston.transports.Console()],
  level: process.env.NODE_ENV === "test" ? "error" : "silly",
});

// logger.error("hello");

export { logger };
