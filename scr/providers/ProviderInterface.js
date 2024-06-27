class ProviderInterface {
    constructor() {
      if (this.constructor === ProviderInterface) {
        throw new Error("Can't instantiate abstract class!");
      }
    }
  
    async generateCompletion(messages, temperature) {
      throw new Error("Method 'generateCompletion()' must be implemented.");
    }
  }
  
  module.exports = ProviderInterface;