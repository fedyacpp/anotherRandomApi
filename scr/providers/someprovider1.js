const BrowserManager = require('../helpers/browser');

class Provider1 {
  constructor(options = {}) {
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
      console.error('Error starting conversation:', error);
      throw error;
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
            console.error('Error parsing JSON:', error);
          }
        }
      }
    } catch (error) {
      console.error('Error in ask method:', error);
      throw error;
    }
  }

  async generateCompletion(messages) {
    try {
      const conversationId = await this.startConversation();
      const prompt = Array.isArray(messages) ? messages[messages.length - 1].content : messages;
      
      let fullResponse = '';
      for await (const textChunk of this.ask(prompt, conversationId)) {
        fullResponse += textChunk;
      }
      
      return { content: fullResponse.trim() };
    } catch (error) {
      console.error('Error in generateCompletion:', error);
      throw error;
    }
  }

  async close() {
    await this.browserManager.close();
  }
}

module.exports = Provider1;