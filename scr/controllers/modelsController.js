const ModelsService = require('../services/ModelsService');
const Logger = require('../helpers/logger');

exports.getModels = async (req, res, next) => {
  try {
    Logger.info('Fetching available models');
    
    const models = await ModelsService.getModels();
    
    Logger.success(`Successfully retrieved ${models.length} models`);
    res.json(models);
  } catch (error) {
    Logger.error(`Error fetching models: ${error.message}`);
    next(error);
  }
};