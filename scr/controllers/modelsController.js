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
    
    Logger.success(`Successfully retrieved ${formattedModels.length} models`);
    
    const response = {
      object: "list",
      data: formattedModels
    };

    res.setHeader('Content-Type', 'application/json');
    res.send(JSON.stringify(response, null, 2));
  } catch (error) {
    Logger.error(`Error fetching models: ${error.message}`);
    
    if (error.name === 'NotFoundError') {
      res.status(404).json({ error: error.message });
    } else if (error.name === 'TimeoutError') {
      res.status(504).json({ error: 'Request timed out' });
    } else if (error.name === 'UnauthorizedError') {
      res.status(401).json({ error: 'Authentication failed' });
    } else if (error.name === 'ForbiddenError') {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }

    next(error);
  }
};