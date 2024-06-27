const Provider1 = require('./someprovider1');
const Provider2 = require('./someprovider2');
const Logger = require('../helpers/logger');

class ProviderPool {
  static providers = {
    'model1': new Provider1(),
    'model2': new Provider2(),
  };

  static getProvider(model) {
    const provider = this.providers[model];
    if (!provider) {
      Logger.error(`Unsupported model requested: ${model}`);
      throw new Error(`Unsupported model: ${model}`);
    }
    Logger.info(`Provider found for model: ${model}`);
    return provider;
  }

  static getModelsInfo() {
    Logger.info('Fetching models information');
    return Object.values(this.providers).map(provider => ({
      id: provider.modelInfo.modelId,
      name: provider.modelInfo.name,
      description: provider.modelInfo.description,
      context_window: provider.modelInfo.context_window,
      author: provider.modelInfo.author,
      unfiltered: provider.modelInfo.unfiltered,
      reverseStatus: provider.modelInfo.reverseStatus,
    }));
  }
}

module.exports = ProviderPool;