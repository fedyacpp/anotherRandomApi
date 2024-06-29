const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');
const Logger = require('../helpers/logger');

class ChatCompletionService {
  static async generateCompletion(model, messages, temperature) {
    const provider = ProviderPool.getProvider(model);
    const providerResponse = await provider.generateCompletion(messages, temperature);

    return ChatCompletionService.formatResponse(model, providerResponse.content);
  }

  static async *generateCompletionStream(model, messages, temperature) {
    const provider = ProviderPool.getProvider(model);
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
        ...chunk
      };
    }
    Logger.success(`Streaming completion finished for model: ${model}`);
  }

  static formatResponse(model, content) {
    return {
      id: `chatcmpl-${generateRandomId()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
      choices: [
        {
          message: {
            role: "assistant",
            content: content
          },
          finish_reason: "stop",
          index: 0
        }
      ]
    };
  }
}

module.exports = ChatCompletionService;