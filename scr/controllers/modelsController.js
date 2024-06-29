const ModelsService = require('../services/modelsService');
const Logger = require('../helpers/logger');

exports.getModels = async (req, res, next) => {
  try {
    Logger.info('Fetching available models');
    
    const formattedModels = await ModelsService.getModels();
    
    Logger.success(`Successfully retrieved models`);
    res.setHeader('Content-Type', 'application/json');
    res.send(formattedModels);
  } catch (error) {
    Logger.error(`Error fetching models: ${error.message}`);
    next(error);
  }
};