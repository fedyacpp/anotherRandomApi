const ImageGenerationService = require('../services/imageGenerationService');
const Logger = require('../helpers/logger');
const { ValidationError } = require('../utils/errors');

exports.generateImage = async (req, res, next) => {
  const startTime = Date.now();
  try {
    Logger.info('Received image generation request', { 
      model: req.body.model,
      prompt: req.body.prompt,
      size: req.body.size,
      n: req.body.n
    });

    const { 
      model, 
      prompt,
      size = '1024x1024',
      n = 1
    } = req.body;

    const ip = req.ip;

    Logger.info(`Processing image generation request`, { model, ip });
    
    if (!model) {
      throw new ValidationError('Model is required');
    }

    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }

    const images = await ImageGenerationService.generateImage(model, prompt, size, n);
    const formattedImages = images.map(image => ({
      url: `data:image/png;base64,${image.toString('base64')}`
    }));
    res.json({ created: Math.floor(Date.now() / 1000), data: formattedImages });
  } catch (error) {
    Logger.error(`Error in image generation`, { 
      error: error.message, 
      stack: error.stack, 
      ip: req.ip, 
      duration: Date.now() - startTime 
    });
    
    if (error instanceof ValidationError) {
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