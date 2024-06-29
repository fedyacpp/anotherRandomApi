const ProviderPool = require('../providers/ProviderPool');

class ModelsService {
  static async getModels() {
    const modelsInfo = ProviderPool.getModelsInfo();
    const formattedJson = JSON.stringify(modelsInfo, null, 2);
    return formattedJson;
  }
}

module.exports = ModelsService;