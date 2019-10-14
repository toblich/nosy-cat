import * as winston from "winston";

//
// Logging levels
//
const config = {
  levels: {
    error: 0,
    debug: 1,
    warn: 2,
    data: 3,
    info: 4,
    verbose: 5,
    silly: 6,
    custom: 7
  },
  colors: {
    error: "red",
    debug: "blue",
    warn: "yellow",
    data: "grey",
    info: "green",
    verbose: "cyan",
    silly: "magenta",
    custom: "yellow"
  }
};

winston.addColors(config.colors);

const logger = winston.createLogger({
  levels: config.levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: "YYYY-MM-DD HH:mm:ss" }),
    winston.format.colorize(),
    winston.format.printf((info: winston.LogEntry) => `${info.timestamp} - ${info.level}: ${info.message}`)
  ),
  transports: [
    new winston.transports.Console({
      level: process.env.LOG || (process.env.NODE_ENV === "test" ? "error" : "debug")
    })
  ],
  level: "custom"
});

// logger.error("hello");

export { logger };
