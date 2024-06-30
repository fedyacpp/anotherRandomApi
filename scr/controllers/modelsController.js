const ModelsService = require('../services/modelsService');
const Logger = require('../helpers/logger');

exports.getModels = async (req, res, next) => {
  try {
    Logger.info('Fetching available models');
    
    const formattedModels = await ModelsService.getModels();
    
    if (!formattedModels || formattedModels.length === 0) {
      const error = new Error('No models found');
      error.name = 'NotFoundError';
      throw error;
    }
    
    Logger.success(`Successfully retrieved models`);
    res.setHeader('Content-Type', 'application/json');
    res.send(formattedModels);
  } catch (error) {
    Logger.error(`Error fetching models: ${error.message}`);
    
    if (error.name === 'NotFoundError') {
      next(error);
    } else if (error.code === 'ECONNABORTED') {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      next(timeoutError);
    } else if (error.response && error.response.status === 401) {
      const authError = new Error('Authentication failed');
      authError.name = 'UnauthorizedError';
      next(authError);
    } else if (error.response && error.response.status === 403) {
      const forbiddenError = new Error('Permission denied');
      forbiddenError.name = 'ForbiddenError';
      next(forbiddenError);
    } else {
      next(error);
    }
  }
};