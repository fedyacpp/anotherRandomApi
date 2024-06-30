const BrowserManager = require('../helpers/browser');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');

class Provider1 extends ProviderInterface {
  constructor(options = {}) {
    super();
    this.browserManager = new BrowserManager({
      ...options,
      url: 'https://pi.ai'
    });
    this.modelInfo = {
      modelId: "pi",
      name: "inflection-2.5",
      description: "Very friendly model by Inflection, using on pi.ai",
      context_window: "???",
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
        if (!res.ok) {
          throw new Error(`HTTP error! status: ${res.status}`);
        }
        return await res.json();
      });
      if (!response.conversations || response.conversations.length === 0) {
        throw new Error('No conversation started');
      }
      return response.conversations[0].sid;
    } catch (error) {
      Logger.error('Error starting conversation:', error);
      const customError = new Error('Failed to start conversation');
      customError.name = 'ProviderError';
      customError.originalError = error;
      throw customError;
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
      const customError = new Error('Failed to get response from provider');
      customError.name = 'ProviderError';
      customError.originalError = error;
      throw customError;
    }
  }

  async generateCompletion(messages, temperature) {
    try {
      const conversationId = await this.startConversation();
      const prompt = this.formatMessages(messages);
      
      Logger.info(`Starting completion with conversation ID: ${conversationId}`);
      const response = await this.askNonStreaming(prompt, conversationId);
      
      return { content: response.trim() };
    } catch (error) {
      Logger.error('Error in generateCompletion:', error);
      if (error.name === 'ProviderError') {
        throw error;
      }
      const customError = new Error('Failed to generate completion');
      customError.name = 'ProviderError';
      customError.originalError = error;
      throw customError;
    }
  }
    
    async askNonStreaming(prompt, conversationId) {
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
    
          const reader = res.body.getReader();
          let result = '';
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            result += new TextDecoder().decode(value);
          }
    
          return result;
        }, prompt, conversationId);
    
    
        let fullText = '';
        const lines = response.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.text) {
                fullText += data.text;
              }
            } catch (e) {
              Logger.warn(`Failed to parse line: ${line}`);
            }
          }
        }
    
        if (!fullText) {
          throw new Error('No text in response');
        }
        
        return fullText;
      } catch (error) {
        const customError = new Error('Failed to get non-streaming response');
        customError.name = 'ProviderError';
        customError.originalError = error;
        throw customError;
      }
    }

    async *generateCompletionStream(messages, temperature) {
      try {
        const conversationId = await this.startConversation();
        const prompt = this.formatMessages(messages);
        
        const response = await this.askNonStreaming(prompt, conversationId);
        
        const sentences = response.match(/[^.!?]+[.!?]+\s*/g) || [response];
        
        for (let i = 0; i < sentences.length; i++) {
          const sentence = sentences[i].trim();
          const words = sentence.split(/\s+/);
          
          for (let j = 0; j < words.length; j++) {
            yield {
              choices: [{
                delta: { 
                  content: words[j] + (j < words.length - 1 ? ' ' : '')
                },
                index: 0,
                finish_reason: null
              }]
            };
            await new Promise(resolve => setTimeout(resolve, 20));
          }
          
          if (i < sentences.length - 1) {
            yield {
              choices: [{
                delta: { content: ' ' },
                index: 0,
                finish_reason: null
              }]
            };
            await new Promise(resolve => setTimeout(resolve, 20));
          }
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
        const customError = new Error('Failed to generate completion stream');
        customError.name = 'ProviderError';
        customError.originalError = error;
        throw customError;
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