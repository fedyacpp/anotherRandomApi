const ProviderPool = require('../providers/ProviderPool');

class ModelsService {
  static async getModels() {
    return ProviderPool.getModelsInfo();
  }
}

module.exports = ModelsService;