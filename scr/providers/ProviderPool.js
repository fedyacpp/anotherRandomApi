const fs = require('fs');
const path = require('path');
const Logger = require('../helpers/logger');

class ProviderPool {
  static chatProviders = [];
  static imageProviders = [];
  static audioProviders = [];
  static chatModelProviderMap = new Map();
  static imageModelProviderMap = new Map();
  static audioModelProviderMap = new Map();
  static chatModelsInfo = [];
  static imageModelsInfo = [];
  static audioModelsInfo = [];
  static providerRatings = new Map();

  static initialize() {
    Logger.info('Initializing ProviderPool');
    try {
      this.loadProviders();
      this.updateModelProviderMaps();
      this.updateModelsInfo();
      this.initializeProviderRatings();
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
      (file.startsWith('someprovider') || file.startsWith('imageprovider') || file.startsWith('audioprovider')) && file.endsWith('.js')
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
        } else if (file.startsWith('audioprovider')) {
          this.audioProviders.push(provider);
        }
        Logger.info(`Loaded provider: ${provider.constructor.name}`);
      } catch (error) {
        Logger.error(`Error loading provider from file ${file}:`, {
          error: error.message,
          stack: error.stack
        });
      }
    });

    Logger.info(`Loaded ${this.chatProviders.length} chat providers, ${this.imageProviders.length} image providers, and ${this.audioProviders.length} audio providers`);
  }

  static updateModelProviderMaps() {
    this.updateModelProviderMap(this.chatProviders, this.chatModelProviderMap);
    this.updateModelProviderMap(this.imageProviders, this.imageModelProviderMap);
    this.updateModelProviderMap(this.audioProviders, this.audioModelProviderMap);
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
    this.audioModelsInfo = this.getModelsInfo(this.audioProviders);
  }

  static getModelsInfo(providers) {
    const modelsMap = new Map();
    providers.forEach(provider => {
      if (!provider.modelInfo) {
        Logger.warn(`Provider ${provider.constructor.name} has no modelInfo`);
        return;
      }
      const modelInfo = { ...provider.modelInfo, providerCount: 1 };
      
      Object.keys(modelInfo).forEach(key => {
        if (modelInfo[key] === 'n/a') {
          modelInfo[key] = null;
        }
      });

      if (modelsMap.has(modelInfo.modelId)) {
        modelsMap.get(modelInfo.modelId).providerCount += 1;
      } else {
        modelsMap.set(modelInfo.modelId, modelInfo);
      }
    });
    return Array.from(modelsMap.values());
  }

  static initializeProviderRatings() {
    [...this.chatProviders, ...this.imageProviders, ...this.audioProviders].forEach(provider => {
      this.providerRatings.set(provider, {
        avgResponseTime: 1000,
        errorCount: 0,
        totalCalls: 0,
        score: 1
      });
    });
  }

  static updateProviderRating(provider, responseTime, isError) {
    const rating = this.providerRatings.get(provider);
    rating.totalCalls++;
    
    rating.avgResponseTime = (rating.avgResponseTime * (rating.totalCalls - 1) + responseTime) / rating.totalCalls;
    
    if (isError) {
      rating.errorCount++;
    }
    
    rating.score = (rating.avgResponseTime / 1000) * (1 + rating.errorCount / rating.totalCalls);
    
    this.providerRatings.set(provider, rating);
  }

  static getProvidersByRating(providers) {
    return providers.sort((a, b) => {
      const scoreA = this.providerRatings.get(a).score;
      const scoreB = this.providerRatings.get(b).score;
      return scoreA - scoreB;
    });
  }

  static getProviders(modelIdentifier, type) {
    Logger.info(`Getting ${type} providers for model: ${modelIdentifier}`);
    
    if (!modelIdentifier) {
      const error = new Error('Model identifier is required');
      Logger.error(error.message);
      throw error;
    }

    let map;
    switch (type) {
      case 'chat':
        map = this.chatModelProviderMap;
        break;
      case 'image':
        map = this.imageModelProviderMap;
        break;
      case 'audio':
        map = this.audioModelProviderMap;
        break;
      default:
        throw new Error(`Invalid provider type: ${type}`);
    }
    
    if (map.has(modelIdentifier)) {
      const providers = Array.from(map.get(modelIdentifier));
      Logger.info(`Found ${providers.length} providers for model: ${modelIdentifier}`);
      return providers;
    }

    const error = new Error(`No ${type} provider found for model ${modelIdentifier}`);
    Logger.error(error.message);
    throw error;
  }

  static async callModel(modelIdentifier, type, ...args) {
    Logger.info(`Attempting to call ${type} model: ${modelIdentifier}`);
    
    const providers = this.getProviders(modelIdentifier, type);
    if (providers.length === 0) {
      const error = new Error(`No providers available for model: ${modelIdentifier}`);
      Logger.error(error.message);
      throw error;
    }

    const sortedProviders = this.getProvidersByRating(providers);

    for (let i = 0; i < sortedProviders.length; i++) {
      const provider = sortedProviders[i];
      Logger.info(`Attempting with provider ${i + 1}/${sortedProviders.length}: ${provider.constructor.name}`);

      const startTime = Date.now();
      try {
        let result;
        switch (type) {
          case 'chat':
            result = await provider.generateCompletion(...args);
            break;
          case 'image':
            result = await provider.generateImage(...args);
            break;
          case 'audio':
            result = await provider.generateTranscription(...args);
            break;
          default:
            throw new Error(`Invalid provider type: ${type}`);
        }

        const responseTime = Date.now() - startTime;

        if (!result) {
          Logger.warn(`No result generated for model: ${modelIdentifier} with provider: ${provider.constructor.name}`);
          this.updateProviderRating(provider, responseTime, true);
          continue;
        }

        this.updateProviderRating(provider, responseTime, false);
        Logger.info(`Successfully called ${type} model: ${modelIdentifier} with provider: ${provider.constructor.name}`);
        return result;
      } catch (error) {
        const responseTime = Date.now() - startTime;
        this.updateProviderRating(provider, responseTime, true);

        Logger.error(`Error calling ${type} model ${modelIdentifier} with provider ${provider.constructor.name}:`, {
          error: error.message,
          stack: error.stack,
          args: args
        });

        if (i === sortedProviders.length - 1) {
          throw new Error(`All providers failed for model ${modelIdentifier}. Last error: ${error.message}`);
        }
      }
    }

    throw new Error(`Unexpected error: All providers failed for model ${modelIdentifier}`);
  }

  static getChatModelsInfo() {
    return this.chatModelsInfo;
  }

  static getImageModelsInfo() {
    return this.imageModelsInfo;
  }

  static getAudioModelsInfo() {
    return this.audioModelsInfo;
  }
}

ProviderPool.initialize();
module.exports = ProviderPool;