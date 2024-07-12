const fs = require('fs');
const path = require('path');
const Logger = require('../helpers/logger');

class ProviderPool {
  static providers = [];
  static modelProviderMap = new Map();
  static modelsInfo = [];

  static initialize() {
    Logger.info('Initializing ProviderPool');
    this.loadProviders();
    this.updateModelProviderMap();
    this.updateModelsInfo();
  }

  static loadProviders() {
    const providerDir = __dirname;
    const providerFiles = fs.readdirSync(providerDir).filter(file => 
      file.startsWith('someprovider') && file.endsWith('.js')
    );

    Logger.info(`Found ${providerFiles.length} provider files`);

    this.providers = providerFiles.map(file => {
      const ProviderClass = require(path.join(providerDir, file));
      return new ProviderClass();
    });

    Logger.info(`Loaded ${this.providers.length} providers`);
  }

  static updateModelProviderMap() {
    this.modelProviderMap.clear();
    this.providers.forEach(provider => {
      if (!provider.modelInfo || !provider.modelInfo.modelId) {
        Logger.warn(`Provider ${provider.constructor.name} has invalid modelInfo`);
        return;
      }

      const modelId = provider.modelInfo.modelId;
      
      if (!this.modelProviderMap.has(modelId)) {
        this.modelProviderMap.set(modelId, new Set());
      }
      this.modelProviderMap.get(modelId).add(provider);
    });

    Logger.info(`Updated model-provider map with ${this.modelProviderMap.size} models`);
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

    Logger.info(`Updated models info with ${this.modelsInfo.length} unique models`);
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