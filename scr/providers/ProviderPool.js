const Provider1 = require('./someprovider1');
const Provider2 = require('./someprovider2');
const Provider3 = require('./someprovider3');
const Provider4 = require('./someprovider4');
const Provider5 = require('./someprovider5');
const Provider6 = require('./someprovider6');
const Provider7 = require('./someprovider7');
const Provider8 = require('./someprovider8');
const Provider9 = require('./someprovider9');
const Provider10 = require('./someprovider10');
const Logger = require('../helpers/logger');

class ProviderPool {
  static providers = [
    new Provider1(),
    new Provider2(),
    new Provider3(),
    new Provider4(),
    new Provider5(),
    new Provider6(),
    new Provider7(),
    new Provider8(),
    new Provider9(),
    new Provider10()
  ];

  static getProvider(modelIdentifier) {
    if (!modelIdentifier) {
      const error = new Error('Model identifier is required');
      error.name = 'ValidationError';
      throw error;
    }

    const provider = this.providers.find(p => 
      p.modelInfo.modelId === modelIdentifier || p.modelInfo.name === modelIdentifier
    );
    
    if (provider) {
      Logger.info(`Provider found for model ${modelIdentifier}: ${provider.constructor.name}`);
      return provider;
    } else {
      Logger.error(`No provider found for model ${modelIdentifier}`);
      const error = new Error(`No provider found for model ${modelIdentifier}`);
      error.name = 'NotFoundError';
      throw error;
    }
  }

  static getModelsInfo() {
    Logger.info('Fetching models information');
    if (this.providers.length === 0) {
      const error = new Error('No providers available');
      error.name = 'ConfigurationError';
      throw error;
    }
    
    return this.providers.map(provider => {
      if (!provider.modelInfo) {
        Logger.warn(`Provider ${provider.constructor.name} has no modelInfo`);
        return null;
      }
      return {
        name: provider.modelInfo.name,
        description: provider.modelInfo.description,
        context_window: provider.modelInfo.context_window,
        author: provider.modelInfo.author,
        unfiltered: provider.modelInfo.unfiltered,
        reverseStatus: provider.modelInfo.reverseStatus,
      };
    }).filter(Boolean);
  }
}

module.exports = ProviderPool;