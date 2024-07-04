const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class ModelsService {
  static getModels() {
    try {
      const models = ProviderPool.getModelsInfo();
      if (!models || models.length === 0) {
        throw new Error('No models available');
      }
      
      const formattedModels = models.map(model => ({
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
      }));

      formattedModels.sort((a, b) => {
        const orderA = this.getProviderOrder(a.owned_by);
        const orderB = this.getProviderOrder(b.owned_by);

        if (orderA !== orderB) {
          return orderA - orderB;
        }

        return a.id.localeCompare(b.id);
      });

      return formattedModels;
    } catch (error) {
      Logger.error(`Error fetching models: ${error.message}`);
      throw error;
    }
  }

  static getProviderOrder(provider) {
    switch (provider.toLowerCase()) {
      case 'openai':
        return 1;
      case 'anthropic':
        return 2;
      default:
        return 3;
    }
  }
}

module.exports = ModelsService;