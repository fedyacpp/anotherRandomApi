const BrowserManager = require('../helpers/browser');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider1Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider1Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider1 extends ProviderInterface {
  constructor(options = {}) {
    super();
    this.browserManager = new BrowserManager({
      ...options,
      url: 'https://pi.ai'
    });
    this.modelInfo = {
      modelId: "inflection-2.5",
      name: "inflection-2.5",
      description: "A friendly and approachable AI assistant developed by Inflection, designed to engage in natural conversations and provide helpful support across various topics",
      context_window: "Unknown",
      author: "Inflection",
      unfiltered: false,
      reverseStatus: "Testing",
      devNotes: "No streaming otherwise you have an account generator"
    };
    this.rateLimiter = {
      tokens: 100,
      refillRate: 50,
      lastRefill: Date.now(),
      capacity: 500
  };
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  async waitForRateLimit() {
    const now = Date.now();
    const elapsedMs = now - this.rateLimiter.lastRefill;
    this.rateLimiter.tokens = Math.min(
      this.rateLimiter.capacity,
      this.rateLimiter.tokens + (elapsedMs * this.rateLimiter.refillRate) / 1000
    );
    this.rateLimiter.lastRefill = now;

    if (this.rateLimiter.tokens < 1) {
      const waitMs = (1 - this.rateLimiter.tokens) * (1000 / this.rateLimiter.refillRate);
      await sleep(waitMs);
      return this.waitForRateLimit();
    }

    this.rateLimiter.tokens -= 1;
  }

  async startConversation() {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
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
          throw new Provider1Error('No conversation started', 'NO_CONVERSATION');
        }
        return response.conversations[0].sid;
      } catch (error) {
        Logger.error(`Error starting conversation (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider1Error('Failed to start conversation after multiple attempts', 'START_CONVERSATION_ERROR', error);
        }
      }
    }
  }

  async *ask(prompt, conversationId) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
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
              throw new Provider1Error('Failed to parse response data', 'PARSE_ERROR', error);
            }
          }
        }
        return;
      } catch (error) {
        Logger.error(`Error in ask method (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider1Error('Failed to get response from provider after multiple attempts', 'ASK_ERROR', error);
        }
      }
    }
  }

  async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        Logger.info('Provider1: Starting generateCompletion', { messagesCount: messages.length, temperature, max_tokens });
        const conversationId = await this.startConversation();
        const prompt = this.formatMessages(messages);
        
        Logger.info(`Provider1: Starting completion with conversation ID: ${conversationId}`);
        const response = await this.askNonStreaming(prompt, conversationId);
        
        Logger.info('Provider1: Completion generated successfully');
        return {
          content: response.trim(),
          usage: {
            prompt_tokens: -1,
            completion_tokens: -1,
            total_tokens: -1
          }
        };
      } catch (error) {
        Logger.error(`Provider1: Error in generateCompletion (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider1Error('Failed to generate completion after multiple attempts', 'COMPLETION_ERROR', error);
        }
      }
    }
  }
  
  async askNonStreaming(prompt, conversationId) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
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
          throw new Provider1Error('No text in response', 'EMPTY_RESPONSE');
        }
        return fullText;
      } catch (error) {
        Logger.error(`Error in askNonStreaming method (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider1Error('Failed to get non-streaming response after multiple attempts', 'NON_STREAMING_ERROR', error);
        }
      }
    }
  }

  async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
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
            await sleep(20);
          }
          
          if (i < sentences.length - 1) {
            yield {
              choices: [{
                delta: { content: ' ' },
                index: 0,
                finish_reason: null
              }]
            };
            await sleep(20);
          }
        }
        return;
      } catch (error) {
        Logger.error(`Error in generateCompletionStream (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider1Error('Failed to generate completion stream after multiple attempts', 'STREAM_ERROR', error);
        }
      }
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