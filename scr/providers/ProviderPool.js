const fs = require('fs');
const path = require('path');
const Logger = require('../helpers/logger');

class ProviderPool {
  static chatProviders = [];
  static imageProviders = [];
  static chatModelProviderMap = new Map();
  static imageModelProviderMap = new Map();
  static chatModelsInfo = [];
  static imageModelsInfo = [];

  static initialize() {
    Logger.info('Initializing ProviderPool');
    try {
      this.loadProviders();
      this.updateModelProviderMaps();
      this.updateModelsInfo();
      Logger.info('ProviderPool initialized successfully');
    } catch (error) {
      Logger.error('Error initializing ProviderPool:', {
        error: error.message,
        stack: error.stack
      });
      throw error;
    }
  }

  static loadProviders() {
    const providerDir = __dirname;
    const providerFiles = fs.readdirSync(providerDir).filter(file =>
      (file.startsWith('someprovider') || file.startsWith('imageprovider')) && file.endsWith('.js')
    );
    Logger.info(`Found ${providerFiles.length} provider files`);

    providerFiles.forEach(file => {
      try {
        const ProviderClass = require(path.join(providerDir, file));
        const provider = new ProviderClass();
        
        if (file.startsWith('someprovider')) {
          this.chatProviders.push(provider);
        } else if (file.startsWith('imageprovider')) {
          this.imageProviders.push(provider);
        }
        Logger.info(`Loaded provider: ${provider.constructor.name}`);
      } catch (error) {
        Logger.error(`Error loading provider from file ${file}:`, {
          error: error.message,
          stack: error.stack
        });
      }
    });

    Logger.info(`Loaded ${this.chatProviders.length} chat providers and ${this.imageProviders.length} image providers`);
  }

  static updateModelProviderMaps() {
    this.updateModelProviderMap(this.chatProviders, this.chatModelProviderMap);
    this.updateModelProviderMap(this.imageProviders, this.imageModelProviderMap);
  }

  static updateModelProviderMap(providers, map) {
    map.clear();
    providers.forEach(provider => {
      if (!provider.modelInfo || !provider.modelInfo.modelId) {
        Logger.warn(`Provider ${provider.constructor.name} has invalid modelInfo`);
        return;
      }
      const modelId = provider.modelInfo.modelId;
      
      if (!map.has(modelId)) {
        map.set(modelId, new Set());
      }
      map.get(modelId).add(provider);
    });
  }

  static updateModelsInfo() {
    this.chatModelsInfo = this.getModelsInfo(this.chatProviders);
    this.imageModelsInfo = this.getModelsInfo(this.imageProviders);
  }

  static getModelsInfo(providers) {
    const modelsMap = new Map();
    providers.forEach(provider => {
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
    return Array.from(modelsMap.values());
  }

  static getProviders(modelIdentifier, isImage = false) {
    const type = isImage ? 'image' : 'chat';
    Logger.info(`Getting ${type} providers for model: ${modelIdentifier}`);
    
    if (!modelIdentifier) {
      const error = new Error('Model identifier is required');
      Logger.error(error.message);
      throw error;
    }

    const map = isImage ? this.imageModelProviderMap : this.chatModelProviderMap;
    
    if (map.has(modelIdentifier)) {
      const providers = Array.from(map.get(modelIdentifier));
      Logger.info(`Found ${providers.length} providers for model: ${modelIdentifier}`);
      return providers;
    }

    const error = new Error(`No ${type} provider found for model ${modelIdentifier}`);
    Logger.error(error.message);
    throw error;
  }

  static async callModel(modelIdentifier, isImage = false, ...args) {
    Logger.info(`Attempting to call ${isImage ? 'image' : 'chat'} model: ${modelIdentifier}`);
    
    const providers = this.getProviders(modelIdentifier, isImage);
    if (providers.length === 0) {
      const error = new Error(`No providers available for model: ${modelIdentifier}`);
      Logger.error(error.message);
      throw error;
    }

    const randomProvider = providers[Math.floor(Math.random() * providers.length)];
    Logger.info(`Selected provider: ${randomProvider.constructor.name}`);

    try {
      let result;
      if (isImage) {
        result = await randomProvider.generateImage(...args);
      } else {
        result = await randomProvider.generateCompletion(...args);
      }

      if (!result) {
        const error = new Error(`No result generated for model: ${modelIdentifier}`);
        Logger.warn(error.message);
        throw error;
      }

      Logger.info(`Successfully called ${isImage ? 'image' : 'chat'} model: ${modelIdentifier}`);
      return result;
    } catch (error) {
      Logger.error(`Error calling ${isImage ? 'image' : 'chat'} model ${modelIdentifier}:`, {
        error: error.message,
        stack: error.stack,
        provider: randomProvider.constructor.name,
        args: args
      });
      throw error;
    }
  }

  static getChatModelsInfo() {
    return this.chatModelsInfo;
  }

  static getImageModelsInfo() {
    return this.imageModelsInfo;
  }
}

ProviderPool.initialize();
module.exports = ProviderPool;