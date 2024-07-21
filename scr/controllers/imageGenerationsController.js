const ImageGenerationService = require('../services/imageGenerationService');
const Logger = require('../helpers/logger');
const { ValidationError } = require('../utils/errors');

exports.generateImage = async (req, res, next) => {
  const startTime = Date.now();
  try {
    const { 
      model, 
      prompt,
      size = '1024x1024',
      n = 1,
      quality = 'standard',
      style = 'natural',
      negative_prompt = '',
      seed = null,
      steps = 30,
      cfg_scale = 7,
      sampler = 'euler_a',
      extras = {}
    } = req.body;

    Logger.info('Received image generation request', { 
      model,
      prompt,
      size,
      n,
      quality,
      style,
      negative_prompt,
      seed,
      steps,
      cfg_scale,
      sampler,
      extras
    });

    if (!model) {
      throw new ValidationError('Model is required');
    }

    if (!prompt) {
      throw new ValidationError('Prompt is required');
    }

    const images = await ImageGenerationService.generateImage(
      model, 
      prompt,
      size,
      n,
      {
        quality,
        style,
        negative_prompt,
        seed,
        steps,
        cfg_scale,
        sampler,
        ...extras
      }
    );

    if (images.length === 0) {
      throw new Error('No images generated');
    }

    res.json({ 
      created: Math.floor(Date.now() / 1000), 
      data: images,
      model,
      prompt
    });

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