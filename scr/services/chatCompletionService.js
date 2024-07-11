const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');
const Logger = require('../helpers/logger');

class ChatCompletionService {static async generateCompletion(model, messages, temperature, max_tokens, functions, function_call, timeout) {
  Logger.info('ChatCompletionService: Starting generateCompletion', { 
    model, 
    messagesCount: messages.length, 
    temperature, 
    max_tokens, 
    timeout 
  });
  
  const timeoutPromise = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Request timed out')), timeout)
  );
  
  try {
    const result = await Promise.race([
      this._generateCompletionInternal(model, messages, temperature, max_tokens, functions, function_call),
      timeoutPromise
    ]);
    Logger.info('ChatCompletionService: Completion generated successfully');
    return result;
  } catch (error) {
    Logger.error(`ChatCompletionService: Error generating completion: ${error.message}`, { stack: error.stack });
    throw error;
  }
}

  static async _generateCompletionInternal(model, messages, temperature, max_tokens, functions, function_call) {
    try {
      const providers = ProviderPool.getProviders(model);
      this.validateProviders(providers, model);
      const randomProvider = this.getRandomProvider(providers);
      Logger.info(`Using provider: ${randomProvider.constructor.name} for model: ${model}`);
      
      const providerResponse = await randomProvider.generateCompletion(messages, temperature, max_tokens, functions, function_call);
      if (!providerResponse || !providerResponse.content) {
        throw new Error('Provider returned empty response');
      }
      return this.formatResponse(model, providerResponse);
    } catch (error) {
      Logger.error(`Error in _generateCompletionInternal: ${error.message}`, { stack: error.stack });
      throw error;
    }
  }

  static async *generateCompletionStream(model, messages, temperature, max_tokens, functions, function_call, timeout) {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Request timed out')), timeout)
    );
  
    const responseId = `chatcmpl-${generateRandomId()}`;
    const created = Math.floor(Date.now() / 1000);
  
    try {
      const streamGenerator = this._generateCompletionStreamInternal(model, messages, temperature, max_tokens, functions, function_call);
      
      for await (const chunk of streamGenerator) {
        try {
          yield {
            id: responseId,
            object: "chat.completion.chunk",
            created: created,
            model: model,
            choices: [
              {
                delta: chunk.choices[0].delta,
                index: 0,
                finish_reason: chunk.choices[0].finish_reason
              }
            ]
          };
  
          await Promise.race([Promise.resolve(), timeoutPromise]);
        } catch (chunkError) {
          Logger.error(`Error processing chunk: ${chunkError.message}`, { stack: chunkError.stack });
          throw chunkError;
        }
      }
      
      Logger.success(`Streaming completion finished for model: ${model}`);
      
      yield {
        id: responseId,
        object: "chat.completion.chunk",
        created: created,
        model: model,
        choices: [
          {
            delta: {},
            index: 0,
            finish_reason: "stop"
          }
        ]
      };
    } catch (error) {
      Logger.error(`Error in completion stream: ${error.message}`, { stack: error.stack });
      yield {
        id: responseId,
        object: "chat.completion.chunk",
        created: created,
        model: model,
        choices: [
          {
            delta: { content: `Error: ${error.message}` },
            index: 0,
            finish_reason: "error"
          }
        ]
      };
    }
  }
  static async *_generateCompletionStreamInternal(model, messages, temperature, max_tokens, functions, function_call) {
    const providers = ProviderPool.getProviders(model);
    this.validateProviders(providers, model);
    const randomProvider = this.getRandomProvider(providers);
    Logger.info(`Starting streaming completion for model: ${model} using provider: ${randomProvider.constructor.name}`);
    try {
        const stream = randomProvider.generateCompletionStream(messages, temperature, max_tokens, functions, function_call);
        
        for await (const chunk of stream) {
            yield chunk;
        }
    } catch (error) {
        Logger.error(`Error in provider ${randomProvider.constructor.name}: ${error.message}`);
        throw new Error(`An unexpected error occurred. Please try again later.`);
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
      usage: {
        prompt_tokens: providerResponse.usage?.prompt_tokens ?? -1,
        completion_tokens: providerResponse.usage?.completion_tokens ?? -1,
        total_tokens: providerResponse.usage?.total_tokens ?? -1
      },
      choices: [
        {
          message: {
            role: "assistant",
            content: providerResponse.content
          },
          logprobs: null,
          finish_reason: "stop",
          index: 0
        }
      ]
    };
  
    return response;
  }

  static validateProviders(providers, model) {
    if (!providers || providers.length === 0) {
      const error = new Error(`No providers found for model: ${model}`);
      error.name = 'ProviderError';
      throw error;
    }
  }

  static getRandomProvider(providers) {
    return providers[Math.floor(Math.random() * providers.length)];
  }
}

module.exports = ChatCompletionService;