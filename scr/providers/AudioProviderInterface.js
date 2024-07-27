class AudioProviderInterface {
    constructor(modelInfo) {
      if (this.constructor === AudioProviderInterface) {
        throw new Error("Can't instantiate abstract class!");
      }
      this.modelInfo = modelInfo;
    }
  
    async generateTranscription(audioFile, language, response_format, temperature) {
      throw new Error("Method 'generateTranscription()' must be implemented.");
    }
  
    async generateSpeech(text, voice, speed) {
      throw new Error("Method 'generateSpeech()' must be implemented.");
    }
  }
  
  module.exports = AudioProviderInterface;