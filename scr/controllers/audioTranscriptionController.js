const AudioTranscriptionService = require('../services/audioTranscriptionService');
const Logger = require('../helpers/logger');
const { ValidationError } = require('../utils/errors');

exports.getAudioTranscription = async (req, res, next) => {
  const startTime = Date.now();
  try {
    Logger.info('Received audio transcription request', { 
      model: req.body.model,
      fileSize: req.file?.size,
      language: req.body.language
    });

    const { 
      model,
      language,
      response_format = 'json',
      temperature = 0
    } = req.body;

    const audioFile = req.file;

    if (!model) {
      throw new ValidationError('Model is required');
    }

    if (!audioFile) {
      throw new ValidationError('Audio file is required');
    }

    if (typeof temperature !== 'number' || temperature < 0 || temperature > 1) {
      throw new ValidationError('Temperature must be a number between 0 and 1');
    }

    const transcription = await AudioTranscriptionService.generateTranscription(
      model, audioFile, language, response_format, temperature
    );

    Logger.success(`Audio transcription generated successfully`, { model, duration: Date.now() - startTime });
    res.json(transcription);

  } catch (error) {
    Logger.error(`Error in audio transcription`, { 
      error: error.message, 
      stack: error.stack, 
      duration: Date.now() - startTime 
    });
    
    if (error.name === 'ProviderError') {
      res.status(500).json({
        error: {
          message: "An error occurred with the audio transcription provider",
          type: "provider_error",
          param: null,
          code: "provider_error"
        }
      });
    } else if (error instanceof ValidationError) {
      res.status(400).json({
        error: {
          message: error.message,
          type: "validation_error",
          param: null,
          code: "invalid_request_error"
        }
      });
    } else {
      res.status(500).json({
        error: {
          message: "An unexpected error occurred",
          type: "api_error",
          param: null,
          code: "internal_error"
        }
      });
    }
    next(error);
  }
};