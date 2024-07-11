const Logger = require('../helpers/logger');

class ProviderPool {
  static providers = [];
  static modelProviderMap = new Map();
  static modelsInfo = [];

  static initialize() {
    const providerClasses = [
      require('./someprovider1'),
      require('./someprovider2'),
      require('./someprovider3'),
      require('./someprovider4'),
      require('./someprovider5'),
      require('./someprovider6'),
      require('./someprovider7'),
      require('./someprovider8'),
      require('./someprovider9'),
      require('./someprovider10'),
      require('./someprovider11'),
      require('./someprovider12'),
      require('./someprovider13'),
      require('./someprovider14'),
      require('./someprovider15'),
      require('./someprovider16'),
      require('./someprovider17'),
      require('./someprovider18'),
      require('./someprovider19'),
      require('./someprovider20'),
      require('./someprovider21'),
      require('./someprovider22'),
      require('./someprovider23'),
      require('./someprovider24')
    ];

    this.providers = providerClasses.map(ProviderClass => new ProviderClass());
    this.updateModelProviderMap();
    this.updateModelsInfo();
  }

  static updateModelProviderMap() {
    this.modelProviderMap.clear();
    this.providers.forEach(provider => {
      const modelId = provider.modelInfo.modelId;
      
      if (!this.modelProviderMap.has(modelId)) {
        this.modelProviderMap.set(modelId, new Set());
      }
      this.modelProviderMap.get(modelId).add(provider);
    });
  }

  static updateModelsInfo() {
    const modelsMap = new Map();

    this.providers.forEach(provider => {
      if (!provider.modelInfo) {
        Logger.warn(`Provider ${provider.constructor.name} has no modelInfo`);
        return;
      }

      const modelInfo = { ...provider.modelInfo, providerCount: 1 };

      if (modelsMap.has(modelInfo.modelId)) {
        modelsMap.get(modelInfo.modelId).providerCount += 1;
      } else {
        modelsMap.set(modelInfo.modelId, modelInfo);
      }
    });

    this.modelsInfo = Array.from(modelsMap.values());
  }

  static getProviders(modelIdentifier) {
    Logger.info(`Getting providers for model: ${modelIdentifier}`);
    if (!modelIdentifier) {
      throw new Error('Model identifier is required');
    }
  
    if (this.modelProviderMap.has(modelIdentifier)) {
      return Array.from(this.modelProviderMap.get(modelIdentifier));
    }
  
    Logger.error(`No provider found for model ${modelIdentifier}`);
    throw new Error(`No provider found for model ${modelIdentifier}`);
  }

  static async callModel(modelIdentifier, messages, temperature) {
    const providers = this.getProviders(modelIdentifier);
    const randomProvider = providers[Math.floor(Math.random() * providers.length)];
    
    try {
      const result = await randomProvider.generateCompletion(messages, temperature);
      Logger.info(`Model called: ${result.model}`);
      return result;
    } catch (error) {
      Logger.error(`Error calling model ${modelIdentifier}: ${error.message}`);
      throw error;
    }
  }

  static getModelsInfo() {
    Logger.info('Fetching models information');
    if (this.providers.length === 0) {
      throw new Error('No providers available');
    }
    
    return this.modelsInfo;
  }

  static getUniqueProviderCount(modelIdentifier) {
    const providers = this.getProviders(modelIdentifier);
    return providers.length;
  }
}

ProviderPool.initialize();

module.exports = ProviderPool;