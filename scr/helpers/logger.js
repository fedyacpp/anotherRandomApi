const chalk = require('chalk');
const cluster = require('cluster');

class Logger {
  static logLevel = process.env.LOG_LEVEL || 'info';

  static levels = {
    error: 0,
    warn: 1,
    info: 2,
    debug: 3
  };

  static shouldLog(level) {
    return this.levels[level] <= this.levels[this.logLevel];
  }

  static formatError(err) {
    if (err instanceof Error) {
      return `${err.stack || err.message}`;
    }
    return JSON.stringify(err, null, 2);
  }

  static log(level, message, error = null) {
    if (this.shouldLog(level)) {
      const color = {
        error: chalk.red,
        warn: chalk.yellow,
        info: chalk.blue,
        debug: chalk.gray,
        success: chalk.green
      }[level];

      const processType = cluster.isMaster ? 'Master' : `Worker ${cluster.worker.id}`;
      const logMessage = `[${processType}] [${level.toUpperCase()}] ${new Date().toISOString()} - ${message}`;

      if (cluster.isMaster) {
        console.log(color(logMessage));
        if (error) {
          console.log(color(this.formatError(error)));
        }
      } else {
        process.send({ type: 'log', level, message: logMessage, error });
      }
    }
  }

  static debug(message, error = null) {
    this.log('debug', message, error);
  }

  static info(message, error = null) {
    this.log('info', message, error);
  }

  static warn(message, error = null) {
    this.log('warn', message, error);
  }

  static error(message, error = null) {
    this.log('error', message, error);
  }

  static success(message) {
    this.log('success', message);
  }
}

module.exports = Logger;