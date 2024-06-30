const ChatCompletionService = require('../services/chatCompletionService');
const Logger = require('../helpers/logger');

exports.getChatCompletion = async (req, res, next) => {
  try {
    const { model, messages, temperature, stream } = req.body;
    Logger.info(`Processing chat completion request for model: ${model}`);
    
    if (!model) {
      const error = new Error('Model is required');
      error.name = 'ValidationError';
      error.errors = { model: 'Model is required' };
      throw error;
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      const error = new Error('Messages must be a non-empty array');
      error.name = 'ValidationError';
      error.errors = { messages: 'Messages must be a non-empty array' };
      throw error;
    }
    
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const streamGenerator = ChatCompletionService.generateCompletionStream(model, messages, temperature);

      for await (const chunk of streamGenerator) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        if (chunk.choices[0].finish_reason === "stop") {
          res.write('data: [DONE]\n\n');
          break;
        }
      }
      
      res.end();
    } else {
      const completion = await ChatCompletionService.generateCompletion(model, messages, temperature);
      Logger.success(`Chat completion generated successfully for model: ${model}`);
      res.json(completion);
    }
  } catch (error) {
    Logger.error(`Error in chat completion: ${error.message}`);

    if (error.name === 'ValidationError') {
      next(error);
    } else if (error.code === 'ECONNABORTED') {
      const timeoutError = new Error('Request timed out');
      timeoutError.name = 'TimeoutError';
      next(timeoutError);
    } else if (error.response && error.response.status === 401) {
      const authError = new Error('Authentication failed');
      authError.name = 'UnauthorizedError';
      next(authError);
    } else if (error.response && error.response.status === 403) {
      const forbiddenError = new Error('Permission denied');
      forbiddenError.name = 'ForbiddenError';
      next(forbiddenError);
    } else if (error.response && error.response.status === 404) {
      const notFoundError = new Error('Resource not found');
      notFoundError.name = 'NotFoundError';
      next(notFoundError);
    } else if (error.response && error.response.status === 429) {
      const rateLimitError = new Error('Rate limit exceeded');
      rateLimitError.name = 'RateLimitError';
      next(rateLimitError);
    } else {
      next(error);
    }
  }
};