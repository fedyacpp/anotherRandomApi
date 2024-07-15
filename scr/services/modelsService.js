const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class ModelsService {
  static providerOrder = {
    openai: 1,
    anthropic: 2
  };

  static getModels() {
    try {
      const chatModels = ProviderPool.getChatModelsInfo();
      const imageModels = ProviderPool.getImageModelsInfo();

      if ((!chatModels || chatModels.length === 0) && (!imageModels || imageModels.length === 0)) {
        throw new Error('No models available');
      }
      
      const formattedChatModels = chatModels.map(model => this.formatModel(model, false));
      const formattedImageModels = imageModels.map(model => this.formatModel(model, true));

      const allModels = [...formattedChatModels, ...formattedImageModels];
      allModels.sort(this.compareModels);

      return allModels;
    } catch (error) {
      Logger.error(`Error fetching models: ${error.message}`);
      throw error;
    }
  }

  static formatModel(model, isImage) {
    return {
      id: model.name,
      object: isImage ? "image_model" : "model",
      description: model.description,
      owned_by: model.author || "unknown",
      unfiltered: model.unfiltered,
      permission: [],
      root: model.name,
      parent: null,
      context_window: model.context_window || 'not applicable',
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

    if (a.object !== b.object) {
      return a.object === "model" ? -1 : 1;
    }

    return a.id.localeCompare(b.id);
  }

  static getProviderOrder(provider) {
    return this.providerOrder[provider.toLowerCase()] || 3;
  }
}

module.exports = ModelsService;