const ProviderPool = require('../providers/ProviderPool');
const Logger = require('../helpers/logger');

class AudioTranscriptionService {
  static async generateTranscription(model, audioFile, language, response_format, temperature) {
    Logger.info('AudioTranscriptionService: Starting generateTranscription', { 
      model, 
      fileSize: audioFile.size, 
      language,
      response_format,
      temperature
    });
    
    try {
      const result = await ProviderPool.callModel(model, false, audioFile, language, response_format, temperature);
      Logger.info('AudioTranscriptionService: Transcription generated successfully');
      return this.formatResponse(model, result);
    } catch (error) {
      Logger.error(`AudioTranscriptionService: Error generating transcription: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  static formatResponse(model, providerResponse) {
    if (!providerResponse || !providerResponse.text) {
      throw new Error('No content provided for response formatting');
    }
    
    return {
      text: providerResponse.text,
      language: providerResponse.language,
      duration: providerResponse.duration,
      segments: providerResponse.segments,
      model: model
    };
  }
}

module.exports = AudioTranscriptionService;