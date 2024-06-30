const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');
const Logger = require('../helpers/logger');

class ChatCompletionService {
  static async generateCompletion(model, messages, temperature) {
    try {
      const provider = ProviderPool.getProvider(model);
      if (!provider) {
        throw new Error(`No provider found for model: ${model}`);
      }
      const providerResponse = await provider.generateCompletion(messages, temperature);
      return ChatCompletionService.formatResponse(model, providerResponse.content);
    } catch (error) {
      Logger.error(`Error generating completion: ${error.message}`);
      const customError = new Error('Failed to generate completion');
      customError.name = 'CompletionError';
      customError.originalError = error;
      throw customError;
    }
  }

  static async *generateCompletionStream(model, messages, temperature) {
    try {
      const provider = ProviderPool.getProvider(model);
      if (!provider) {
        throw new Error(`No provider found for model: ${model}`);
      }
      Logger.info(`Starting streaming completion for model: ${model}`);
      const stream = provider.generateCompletionStream(messages, temperature);
    
      const responseId = `chatcmpl-${generateRandomId()}`;
      const created = Math.floor(Date.now() / 1000);
    
      for await (const chunk of stream) {
        yield {
          id: responseId,
          object: "chat.completion.chunk",
          created: created,
          model: model,
          choices: chunk.choices
        };
      }
      
      Logger.success(`Streaming completion finished for model: ${model}`);
    } catch (error) {
      Logger.error(`Error in completion stream: ${error.message}`);
      const customError = new Error('Failed to generate completion stream');
      customError.name = 'StreamCompletionError';
      customError.originalError = error;
      throw customError;
    }
  }

  static formatResponse(model, content) {
    if (!content) {
      throw new Error('No content provided for response formatting');
    }
    return {
      id: `chatcmpl-${generateRandomId()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: content
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: -1,
        completion_tokens: -1,
        total_tokens: -1
      }
    };
  }
}

module.exports = ChatCompletionService;