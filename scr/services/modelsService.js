const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class ModelsService {
  static getModels() {
    try {
      const models = ProviderPool.getModelsInfo();
      if (!models || models.length === 0) {
        throw new Error('No models available');
      }
      return models.map(model => ({
        id: model.name,
        object: "model",
        created: Math.floor(Date.now() / 1000),
        owned_by: model.author || "unknown",
        permission: [],
        root: model.name,
        parent: null,
        context_window: model.context_window || -1,
      }));
    } catch (error) {
      Logger.error(`Error fetching models: ${error.message}`);
      const customError = new Error('Failed to fetch models');
      customError.name = 'ModelsRetrievalError';
      customError.originalError = error;
      throw customError;
    }
  }
}

module.exports = ModelsService;