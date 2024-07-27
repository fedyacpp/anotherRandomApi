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
      const audioModels = ProviderPool.getAudioModelsInfo();

      if ((!chatModels || chatModels.length === 0) && 
          (!imageModels || imageModels.length === 0) && 
          (!audioModels || audioModels.length === 0)) {
        throw new Error('No models available');
      }
      
      const formattedChatModels = chatModels.map(model => this.formatModel(model, 'chat'));
      const formattedImageModels = imageModels.map(model => this.formatModel(model, 'image'));
      const formattedAudioModels = audioModels.map(model => this.formatModel(model, 'audio'));

      const sortedChatModels = this.sortModelsByProvider(formattedChatModels);
      const sortedImageModels = this.sortModelsByProvider(formattedImageModels);
      const sortedAudioModels = this.sortModelsByProvider(formattedAudioModels);

      return [...sortedChatModels, ...sortedImageModels, ...sortedAudioModels];
    } catch (error) {
      Logger.error(`Error fetching models: ${error.message}`);
      throw error;
    }
  }

  static formatModel(model, type) {
    return {
      id: model.name,
      object: this.getModelObject(type),
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

  static getModelObject(type) {
    switch (type) {
      case 'chat':
        return 'model';
      case 'image':
        return 'image_model';
      case 'audio':
        return 'audio_model';
      default:
        return 'unknown_model';
    }
  }

  static sortModelsByProvider(models) {
    return models.sort((a, b) => {
      const orderA = this.getProviderOrder(a.owned_by);
      const orderB = this.getProviderOrder(b.owned_by);

      if (orderA !== orderB) {
        return orderA - orderB;
      }

      return a.id.localeCompare(b.id);
    });
  }

  static getProviderOrder(provider) {
    return this.providerOrder[provider.toLowerCase()] || 3;
  }
}

module.exports = ModelsService;