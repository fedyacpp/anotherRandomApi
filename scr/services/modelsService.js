const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class ModelsService {
  static providerOrder = {
    openai: 1,
    anthropic: 2
  };

  static getModels() {
    try {
      const models = ProviderPool.getModelsInfo();
      if (!models || models.length === 0) {
        throw new Error('No models available');
      }
      
      const formattedModels = models.map(this.formatModel);
      formattedModels.sort(this.compareModels);

      return formattedModels;
    } catch (error) {
      Logger.error(`Error fetching models: ${error.message}`);
      throw error;
    }
  }

  static formatModel(model) {
    return {
      id: model.name,
      object: "model",
      description: model.description,
      owned_by: model.author || "unknown",
      unfiltered: model.unfiltered,
      permission: [],
      root: model.name,
      parent: null,
      context_window: model.context_window || -1,
      reverseStatus: model.reverseStatus,
      providerCount: model.providerCount
    };
  }

  static compareModels(a, b) {
    const orderA = ModelsService.getProviderOrder(a.owned_by);
    const orderB = ModelsService.getProviderOrder(b.owned_by);

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    return a.id.localeCompare(b.id);
  }

  static getProviderOrder(provider) {
    return this.providerOrder[provider.toLowerCase()] || 3;
  }
}

module.exports = ModelsService;