class ImageProviderInterface {
    constructor(modelInfo) {
      if (this.constructor === ImageProviderInterface) {
        throw new Error("Can't instantiate abstract class!");
      }
      this.modelInfo = modelInfo;
    }
  
    async generateImage(prompt, size, n = 1) {
      throw new Error("Method 'generateImage()' must be implemented.");
    }
  }
  
  module.exports = ImageProviderInterface;