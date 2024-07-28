const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');
const Logger = require('../helpers/logger');

class ChatCompletionService {
  static providerPerformance = new Map();

  static async generateCompletion(model, messages, temperature, max_tokens, functions, function_call, timeout) {
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
    const providers = ProviderPool.getProviders(model, 'chat');
    this.validateProviders(providers, model);
    const selectedProvider = this.selectProvider(providers);
    Logger.info(`Using provider: ${selectedProvider.constructor.name} for model: ${model}`);
    
    const startTime = Date.now();
    try {
      const providerResponse = await selectedProvider.generateCompletion(messages, temperature, max_tokens, functions, function_call);
      if (!providerResponse || !providerResponse.content) {
        throw new Error('Provider returned empty response');
      }
      const endTime = Date.now();
      this.updateProviderPerformance(selectedProvider, endTime - startTime, true);
      return this.formatResponse(model, providerResponse);
    } catch (error) {
      const endTime = Date.now();
      this.updateProviderPerformance(selectedProvider, endTime - startTime, false);
      throw error;
    }
  }

  static selectProvider(providers) {
    const sortedProviders = providers.sort((a, b) => {
      const perfA = this.providerPerformance.get(a.constructor.name) || { successRate: 0, avgResponseTime: Infinity };
      const perfB = this.providerPerformance.get(b.constructor.name) || { successRate: 0, avgResponseTime: Infinity };
      
      if (perfA.successRate !== perfB.successRate) {
        return perfB.successRate - perfA.successRate;
      }
      return perfA.avgResponseTime - perfB.avgResponseTime;
    });

    const totalProviders = sortedProviders.length;
    const randomValue = Math.random();
    const selectedIndex = Math.floor(Math.pow(randomValue, 2) * totalProviders);
    
    return sortedProviders[selectedIndex];
  }

  static updateProviderPerformance(provider, responseTime, isSuccess) {
    const providerName = provider.constructor.name;
    const currentPerf = this.providerPerformance.get(providerName) || { 
      totalCalls: 0, 
      successfulCalls: 0, 
      totalResponseTime: 0, 
      avgResponseTime: 0, 
      successRate: 0 
    };

    currentPerf.totalCalls++;
    currentPerf.totalResponseTime += responseTime;
    if (isSuccess) {
      currentPerf.successfulCalls++;
    }

    currentPerf.avgResponseTime = currentPerf.totalResponseTime / currentPerf.totalCalls;
    currentPerf.successRate = currentPerf.successfulCalls / currentPerf.totalCalls;

    this.providerPerformance.set(providerName, currentPerf);
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
        const formattedChunk = this.formatStreamChunk(responseId, created, model, chunk);
        yield formattedChunk;
        await Promise.race([Promise.resolve(), timeoutPromise]);
      }
      
      Logger.info(`Streaming completion finished for model: ${model}`);
      yield this.formatFinalStreamChunk(responseId, created, model);
    } catch (error) {
      Logger.error(`Error in completion stream: ${error.message}`, { stack: error.stack });
      yield this.formatErrorStreamChunk(responseId, created, model, error);
    }
  }

  static async *_generateCompletionStreamInternal(model, messages, temperature, max_tokens, functions, function_call) {
    const providers = ProviderPool.getProviders(model, 'chat');
    this.validateProviders(providers, model);
    const selectedProvider = this.selectProvider(providers);
    Logger.info(`Starting streaming completion for model: ${model} using provider: ${selectedProvider.constructor.name}`);
    
    const startTime = Date.now();
    try {
      const stream = selectedProvider.generateCompletionStream(messages, temperature, max_tokens, functions, function_call);
      for await (const chunk of stream) {
        yield chunk;
      }
      const endTime = Date.now();
      this.updateProviderPerformance(selectedProvider, endTime - startTime, true);
    } catch (error) {
      const endTime = Date.now();
      this.updateProviderPerformance(selectedProvider, endTime - startTime, false);
      Logger.error(`Error in provider ${selectedProvider.constructor.name}: ${error.message}`);
      throw new Error(`An unexpected error occurred. Please try again later.`);
    }
  }

  static formatResponse(model, providerResponse) {
    if (!providerResponse || !providerResponse.content) {
      throw new Error('No content provided for response formatting');
    }
    
    return {
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
  }

  static formatStreamChunk(responseId, created, model, chunk) {
    return {
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
  }

  static formatFinalStreamChunk(responseId, created, model) {
    return {
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
  }

  static formatErrorStreamChunk(responseId, created, model, error) {
    return {
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

  static validateProviders(providers, model) {
    if (!providers || providers.length === 0) {
      const error = new Error(`No providers found for model: ${model}`);
      error.name = 'ProviderError';
      throw error;
    }
  }
}

module.exports = ChatCompletionService;