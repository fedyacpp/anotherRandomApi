const Logger = require('../helpers/logger');

module.exports = (err, req, res, next) => {
  Logger.error(`Error occurred: ${err.message}\nStack: ${err.stack}`);
  
  res.status(500).json({
    error: {
      message: 'Internal Server Error',
      details: process.env.NODE_ENV === 'development' ? err.message : undefined
    }
  });
};