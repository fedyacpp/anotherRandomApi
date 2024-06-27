const ProviderPool = require('../providers/ProviderPool');
const { generateRandomId } = require('../helpers/utils');

class ChatCompletionService {
  static async generateCompletion(model, messages, temperature) {
    const provider = ProviderPool.getProvider(model);
    const providerResponse = await provider.generateCompletion(messages, temperature);

    return {
      id: `chatcmpl-${generateRandomId()}`,
      object: "chat.completion",
      created: Math.floor(Date.now() / 1000),
      model: model,
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
}

module.exports = ChatCompletionService;