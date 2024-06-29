const BrowserManager = require('../helpers/browser');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');

class Provider1 extends ProviderInterface {
  constructor(options = {}) {
    super();
    this.browserManager = new BrowserManager(options);
    this.modelInfo = {
      modelId: "pi",
      name: "inflection-2.5",
      description: "Latest model by Inflection, using on pi.ai",
      context_window: 4000,
      author: "Inflection",
      unfiltered: false,
      reverseStatus: "Testing",
      devNotes: ""
    };
  }

  async startConversation() {
    try {
      const response = await this.browserManager.evaluate(async () => {
        const res = await fetch('https://pi.ai/api/chat/start', {
          method: 'POST',
          headers: {
            'accept': 'application/json',
            'x-api-version': '3',
          },
          body: '{}',
        });
        return await res.json();
      });
      return response.conversations[0].sid;
    } catch (error) {
      Logger.error('Error starting conversation:', error);
      throw new Error('Error starting conversation:', error);
    }
  }

  async *ask(prompt, conversationId) {
    try {
      const response = await this.browserManager.evaluate(async (prompt, conversationId) => {
        const res = await fetch('https://pi.ai/api/chat', {
          method: 'POST',
          headers: {
            'accept': 'text/event-stream',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            text: prompt,
            conversation: conversationId,
            mode: 'BASE'
          }),
        });
        return await res.text();
      }, prompt, conversationId);

      const lines = response.split('\n');
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.text) {
              yield data.text;
            }
          } catch (error) {
            Logger.error('Error parsing JSON:', error);
          }
        }
      }
    } catch (error) {
      Logger.error('Error in ask method:', error);
      throw new Error('Error in ask method:', error);
    }
  }

  async generateCompletion(messages, temperature) {
    try {
      const conversationId = await this.startConversation();
      const prompt = this.formatMessages(messages);
      
      let fullResponse = '';
      for await (const textChunk of this.ask(prompt, conversationId)) {
        fullResponse += textChunk;
      }
      
      return { content: fullResponse.trim() };
    } catch (error) {
      Logger.error('Error in generateCompletion:', error);
      throw new Error('Error in generateCompletion:', error);
    }
  }

  async *generateCompletionStream(messages, temperature) {
    try {
      const conversationId = await this.startConversation();
      const prompt = this.formatMessages(messages);
      
      let fullResponse = '';
      for await (const textChunk of this.ask(prompt, conversationId)) {
        fullResponse += textChunk;
      }
      
      const words = fullResponse.split(' ');
      
      for (const word of words) {
        yield {
          choices: [{
            delta: { content: word + ' ' },
            index: 0,
            finish_reason: null
          }]
        };
        await new Promise(resolve => setTimeout(resolve, 10));
      }
      
      yield {
        choices: [{
          delta: {},
          index: 0,
          finish_reason: "stop"
        }]
      };
    } catch (error) {
      Logger.error('Error in generateCompletionStream:', error);
      throw new Error('Error in generateCompletionStream:', error);
    }
  }

  formatMessages(messages) {
    if (Array.isArray(messages)) {
      return messages.map(message => `${message.role}: ${message.content}`).join('\n');
    }
    return messages;
  }
}

module.exports = Provider1;