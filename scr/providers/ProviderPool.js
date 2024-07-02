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
const Provider11 = require('./someprovider11');
const Provider12 = require('./someprovider12');
const Provider13 = require('./someprovider13');
const Provider14 = require('./someprovider14');
const Provider15 = require('./someprovider15');
const Provider16 = require('./someprovider16');
const Provider17 = require('./someprovider17');
const Provider18 = require('./someprovider18');
const Provider19 = require('./someprovider19');
const Provider20 = require('./someprovider20');
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
    new Provider10(),
    new Provider11(),
    new Provider12(),
    new Provider13(),
    new Provider14(),
    new Provider15(),
    new Provider16(),
    new Provider17(),
    new Provider18(),
    new Provider19(),
    new Provider20()
  ];

  static getProviders(modelIdentifier) {
    if (!modelIdentifier) {
      const error = new Error('Model identifier is required');
      error.name = 'ValidationError';
      throw error;
    }

    const matchingProviders = this.providers.filter(p => 
      p.modelInfo.modelId === modelIdentifier || p.modelInfo.name === modelIdentifier
    );
    
    if (matchingProviders.length > 0) {
      Logger.info(`Found ${matchingProviders.length} providers for model ${modelIdentifier}`);
      return matchingProviders;
    } else {
      Logger.error(`No provider found for model ${modelIdentifier}`);
      const error = new Error(`No provider found for model ${modelIdentifier}`);
      error.name = 'NotFoundError';
      throw error;
    }
  }

  static async callModel(modelIdentifier, messages, temperature) {
    const providers = this.getProviders(modelIdentifier);
    
    const randomProvider = providers[Math.floor(Math.random() * providers.length)];
    
    try {
      const response = await randomProvider.generateCompletion(messages, temperature);
      return response;
    } catch (error) {
      Logger.error(`Error calling model ${modelIdentifier}: ${error.message}`);
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
    
    const modelsMap = new Map();

    this.providers.forEach(provider => {
      if (!provider.modelInfo) {
        Logger.warn(`Provider ${provider.constructor.name} has no modelInfo`);
        return;
      }

      const modelInfo = {
        name: provider.modelInfo.name,
        description: provider.modelInfo.description,
        context_window: provider.modelInfo.context_window,
        author: provider.modelInfo.author,
        unfiltered: provider.modelInfo.unfiltered,
        reverseStatus: provider.modelInfo.reverseStatus,
        providerCount: 1
      };

      if (modelsMap.has(modelInfo.name)) {
        const existingModel = modelsMap.get(modelInfo.name);
        existingModel.providerCount += 1;
      } else {
        modelsMap.set(modelInfo.name, modelInfo);
      }
    });

    return Array.from(modelsMap.values());
  }
}

module.exports = ProviderPool;