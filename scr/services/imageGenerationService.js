const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class ImageGenerationService {
  static async generateImage(model, prompt, size, n = 1) {
    Logger.info('ImageGenerationService: Starting image generation', { 
      model, 
      prompt,
      size,
      n
    });
    
    try {
      const result = await ProviderPool.callModel(model, true, prompt, size, n);
      Logger.info('ImageGenerationService: Image generated successfully');
      return result;
    } catch (error) {
      Logger.error(`ImageGenerationService: Error generating image: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }
}

module.exports = ImageGenerationService;