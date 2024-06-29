const Provider1 = require('./someprovider1');
const Provider2 = require('./someprovider2');
const Logger = require('../helpers/logger');

class ProviderPool {
  static providers = [
    new Provider1(),
    new Provider2(),
  ];

  static getProvider(modelIdentifier) {
    const provider = this.providers.find(p => 
      p.modelInfo.modelId === modelIdentifier || p.modelInfo.name === modelIdentifier
    );

    if (!provider) {
      Logger.error(`Unsupported model requested: ${modelIdentifier}`);
      throw new Error(`Unsupported model: ${modelIdentifier}`);
    }
    Logger.info(`Provider found for model: ${modelIdentifier}`);
    return provider;
  }

  static getModelsInfo() {
    Logger.info('Fetching models information');
    return this.providers.map(provider => ({
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