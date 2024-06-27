const chalk = require('chalk');

class Logger {
  static info(message) {
    console.log(chalk.blue(`[INFO] ${new Date().toISOString()} - ${message}`));
  }

  static success(message) {
    console.log(chalk.green(`[SUCCESS] ${new Date().toISOString()} - ${message}`));
  }

  static warn(message) {
    console.log(chalk.yellow(`[WARN] ${new Date().toISOString()} - ${message}`));
  }

  static error(message) {
    console.log(chalk.red(`[ERROR] ${new Date().toISOString()} - ${message}`));
  }
}

module.exports = Logger;