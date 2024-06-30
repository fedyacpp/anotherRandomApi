const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');
const Logger = require('../helpers/logger');

class ChatCompletionService {
  static async generateCompletion(model, messages, temperature, max_tokens, functions, function_call, timeout) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout)
    );
    
    try {
      const result = await Promise.race([
        this._generateCompletionInternal(model, messages, temperature, max_tokens, functions, function_call),
        timeoutPromise
      ]);
      return result;
    } catch (error) {
      Logger.error(`Error generating completion: ${error.message}`);
      if (error.message === 'Request timed out') {
        const timeoutError = new Error('Request timed out');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      if (error.name === 'ProviderError') {
        throw error;
      }
      const customError = new Error('Failed to generate completion');
      customError.name = 'CompletionError';
      customError.originalError = error;
      throw customError;
    }
  }

  static async _generateCompletionInternal(model, messages, temperature, max_tokens, functions, function_call) {
    const provider = ProviderPool.getProvider(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }
    const providerResponse = await provider.generateCompletion(messages, temperature, max_tokens, functions, function_call);
    return this.formatResponse(model, providerResponse);
  }

  static async *generateCompletionStream(model, messages, temperature, max_tokens, functions, function_call, timeout) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout)
    );

    try {
      const streamGenerator = this._generateCompletionStreamInternal(model, messages, temperature, max_tokens, functions, function_call);
      
      const responseId = `chatcmpl-${generateRandomId()}`;
      const created = Math.floor(Date.now() / 1000);

      for await (const chunk of streamGenerator) {
        yield {
          id: responseId,
          object: "chat.completion.chunk",
          created: created,
          model: model,
          choices: chunk.choices
        };

        // Check for timeout
        await Promise.race([Promise.resolve(), timeoutPromise]);
      }
      
      Logger.success(`Streaming completion finished for model: ${model}`);
    } catch (error) {
      Logger.error(`Error in completion stream: ${error.message}`);
      if (error.message === 'Request timed out') {
        const timeoutError = new Error('Request timed out');
        timeoutError.name = 'TimeoutError';
        throw timeoutError;
      }
      const customError = new Error('Failed to generate completion stream');
      customError.name = 'StreamCompletionError';
      customError.originalError = error;
      throw customError;
    }
  }

  static async *_generateCompletionStreamInternal(model, messages, temperature, max_tokens, functions, function_call) {
    const provider = ProviderPool.getProvider(model);
    if (!provider) {
      throw new Error(`No provider found for model: ${model}`);
    }
    Logger.info(`Starting streaming completion for model: ${model}`);
    const stream = provider.generateCompletionStream(messages, temperature, max_tokens, functions, function_call);
    
    for await (const chunk of stream) {
      yield chunk;
    }
  }

  static formatResponse(model, providerResponse) {
    if (!providerResponse || !providerResponse.content) {
      throw new Error('No content provided for response formatting');
    }
    
    const response = {
      id: `chatcmpl-${generateRandomId()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: providerResponse.content
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: providerResponse.usage?.prompt_tokens ?? -1,
        completion_tokens: providerResponse.usage?.completion_tokens ?? -1,
        total_tokens: providerResponse.usage?.total_tokens ?? -1
      }
    };

    if (providerResponse.function_call) {
      response.choices[0].message.function_call = providerResponse.function_call;
    }

    return response;
  }

  static validateProvider(provider, model) {
    if (!provider) {
      const error = new Error(`No provider found for model: ${model}`);
      error.name = 'ProviderError';
      throw error;
    }
  }

  static handleProviderError(error, operation) {
    Logger.error(`Error in ${operation}: ${error.message}`);
    if (error.name === 'ProviderError') {
      throw error;
    }
    const customError = new Error(`Failed to ${operation}`);
    customError.name = 'CompletionError';
    customError.originalError = error;
    throw customError;
  }
}

module.exports = ChatCompletionService;