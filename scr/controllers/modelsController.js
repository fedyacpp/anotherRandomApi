const NodeCache = require('node-cache');
const ModelsService = require('../services/modelsService');
const Logger = require('../helpers/logger');
const { NotFoundError, TimeoutError, UnauthorizedError, ForbiddenError } = require('../utils/errors');

const cache = new NodeCache({ stdTTL: 900 }); // 15 minutes

exports.getModels = async (req, res, next) => {
  try {
    Logger.info('Fetching available models');
    
    let formattedModels = cache.get('models');
    if (!formattedModels) {
      formattedModels = await ModelsService.getModels();
      if (formattedModels && formattedModels.length > 0) {
        cache.set('models', formattedModels);
      } else {
        throw new NotFoundError('No models found');
      }
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
    
    if (error instanceof NotFoundError) {
      res.status(404).json({ error: error.message });
    } else if (error instanceof TimeoutError) {
      res.status(504).json({ error: 'Request timed out' });
    } else if (error instanceof UnauthorizedError) {
      res.status(401).json({ error: 'Authentication failed' });
    } else if (error instanceof ForbiddenError) {
      res.status(403).json({ error: 'Permission denied' });
    } else {
      res.status(500).json({ error: 'Internal server error' });
    }

    next(error);
  }
};