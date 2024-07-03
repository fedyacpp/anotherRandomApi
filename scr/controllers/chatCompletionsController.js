const ChatCompletionService = require('../services/chatCompletionService');
const Logger = require('../helpers/logger');

exports.getChatCompletion = async (req, res, next) => {
  try {
    const { 
      model, 
      messages, 
      temperature, 
      stream, 
      max_tokens, 
      functions, 
      function_call,
      timeout = 30000
    } = req.body;

    const ip = req.ip;

    Logger.info(`Processing chat completion request for model: ${model}`);
    
    if (!model) {
      throw createValidationError('Model is required', { model: 'Model is required' });
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw createValidationError('Messages must be a non-empty array', { messages: 'Messages must be a non-empty array' });
    }

    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 1)) {
      throw createValidationError('Temperature must be a number between 0 and 1', { temperature: 'Temperature must be a number between 0 and 1' });
    }

    if (max_tokens !== undefined && (typeof max_tokens !== 'number' || max_tokens <= 0)) {
      throw createValidationError('max_tokens must be a positive number', { max_tokens: 'max_tokens must be a positive number' });
    }

    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      try {
        const streamGenerator = ChatCompletionService.generateCompletionStream(
          model, messages, temperature, max_tokens, functions, function_call, timeout, ip
        );

        for await (const chunk of streamGenerator) {
          if (res.writableEnded) break;
          res.write(`data: ${JSON.stringify(chunk)}\n\n`);
          
          if (chunk.choices[0].finish_reason === "stop") {
            res.write('data: [DONE]\n\n');
            break;
          }
        }
        
        if (!res.writableEnded) {
          Logger.success(`Streaming chat completion generated successfully for model: ${model}`);
          res.end();
        }
      } catch (error) {
        if (!res.headersSent) {
          handleError(error, next);
        } else {
          Logger.error(`Error in stream after headers sent: ${error.message}`);
          res.end();
        }
      }
    } else {
      const completion = await ChatCompletionService.generateCompletion(
        model, messages, temperature, max_tokens, functions, function_call, timeout
      );
      Logger.success(`Chat completion generated successfully for model: ${model}`);
      res.json(completion);
    }
  } catch (error) {
    Logger.error(`Error in chat completion: ${error.message}`);
    handleError(error, next);
  }
};

function createValidationError(message, errors) {
  const error = new Error(message);
  error.name = 'ValidationError';
  error.errors = errors;
  return error;
}

function handleError(error, next) {
  if (error.name === 'ValidationError') {
    next(error);
  } else if (error.name === 'TimeoutError') {
    next(error);
  } else if (error.response) {
    switch (error.response.status) {
      case 401:
        next(new Error('Authentication failed'));
        break;
      case 403:
        next(new Error('Permission denied'));
        break;
      case 404:
        next(new Error('Resource not found'));
        break;
      case 429:
        next(new Error('Rate limit exceeded'));
        break;
      default:
        next(error);
    }
  } else {
    next(error);
  }
}