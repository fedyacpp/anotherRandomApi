const ChatCompletionService = require('../services/chatCompletionService');
const Logger = require('../helpers/logger');
const { ValidationError, TimeoutError } = require('../utils/errors');

exports.getChatCompletion = async (req, res, next) => {
  const startTime = Date.now();
  try {
    Logger.info('Received chat completion request', { 
      model: req.body.model,
      messagesCount: req.body.messages?.length,
      temperature: req.body.temperature,
      stream: req.body.stream
    });

    const timeout = 30000;

    const { 
      model, 
      messages, 
      temperature = 1, 
      top_p = 1,
      n = 1,
      stream = false, 
      stop = null,
      max_tokens = Infinity,
      presence_penalty = 0,
      frequency_penalty = 0,
      logit_bias = null,
      user = null,
      functions,
      function_call,
    } = req.body;

    const ip = req.ip;

    Logger.info(`Processing chat completion request`, { model, ip });
    
    if (!model) {
      throw new ValidationError('Model is required');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new ValidationError('Messages must be a non-empty array');
    }

    if (typeof temperature !== 'number' || temperature < 0 || temperature > 2) {
      throw new ValidationError('Temperature must be a number between 0 and 2');
    }

    if (typeof top_p !== 'number' || top_p < 0 || top_p > 1) {
      throw new ValidationError('Top_p must be a number between 0 and 1');
    }

    if (typeof n !== 'number' || n < 1 || n > 10) {
      throw new ValidationError('N must be a number between 1 and 10');
    }

    if (max_tokens !== Infinity && (typeof max_tokens !== 'number' || max_tokens < 1)) {
      throw new ValidationError('Max_tokens must be a positive number');
    }

    if (typeof presence_penalty !== 'number' || presence_penalty < -2 || presence_penalty > 2) {
      throw new ValidationError('Presence_penalty must be a number between -2 and 2');
    }

    if (typeof frequency_penalty !== 'number' || frequency_penalty < -2 || frequency_penalty > 2) {
      throw new ValidationError('Frequency_penalty must be a number between -2 and 2');
    }

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
    
      try {
        const streamGenerator = ChatCompletionService.generateCompletionStream(
          model, messages, temperature, max_tokens, functions, function_call, 30000
        );
    
        for await (const chunk of streamGenerator) {
          if (res.writableEnded) break;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        }
        
        if (!res.writableEnded) {
          res.write('data: [DONE]\n\n');
          Logger.success(`Streaming chat completion generated successfully`, { model, ip, duration: Date.now() - startTime });
          res.end();
        }
      } catch (error) {
        Logger.error(`Error in stream generation`, { error: error.message, model, ip });
        if (!res.headersSent) {
          res.status(500).json({
            error: {
              message: "An error occurred during stream generation",
              type: "api_error",
              param: null,
              code: "stream_error"
            }
          });
        } else if (!res.writableEnded) {
          res.write(`data: ${JSON.stringify({error: "Stream error occurred"})}\n\n`);
          res.end();
        }
      }
    } else {
      const completion = await ChatCompletionService.generateCompletion(
        model, messages, temperature, max_tokens, functions, function_call, timeout
      );
      Logger.success(`Chat completion generated successfully`, { model, ip, duration: Date.now() - startTime });
      res.json(completion);
    }
  } catch (error) {
    Logger.error(`Error in chat completion`, { 
      error: error.message, 
      stack: error.stack, 
      ip: req.ip, 
      duration: Date.now() - startTime 
    });
    next(error);
    if (error.name === 'ProviderError') {
      res.status(500).json({
        error: {
          message: "An error occurred with the language model provider",
          type: "provider_error",
          param: null,
          code: "provider_error"
        }
      });
    } else if (error.name === 'TimeoutError') {
      res.status(504).json({
        error: {
          message: "Request timed out",
          type: "timeout_error",
          param: null,
          code: "timeout"
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
  }
};