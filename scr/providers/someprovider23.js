const axios = require('axios');
const Logger = require('../helpers/logger');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider23Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider23Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider23 {
  constructor() {
    this.baseUrl = 'https://duckduckgo.com/duckchat/v1';
    this.modelInfo = {
      modelId: "llama-3-70b-chat",
      name: "llama-3-70b-chat",
      description: "Meta's extensive open-source chat model, designed for natural and engaging conversations",
      context_window: 8192,
      author: "Meta",
      unfiltered: true,
      reverseStatus: "Testing",
      devNotes: ""
    };
    this.vqd = null;
    this.historyContent = null;
    this.newMessages = [];
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

  async getInitialVqd() {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        const response = await axios.get(`${this.baseUrl}/status`, {
          headers: { ...this.getStatusHeaders(), 'x-vqd-accept': '1' }
        });

        this.vqd = response.headers['x-vqd-4'];
        if (!this.vqd) {
          throw new Provider23Error('Failed to extract vqd from status response', 'VQD_EXTRACTION_ERROR');
        }

        Logger.info(`Provider23: Successfully extracted initial vqd: ${this.vqd}`);
        return this.vqd;
      } catch (error) {
        Logger.error(`Provider23: Error in getInitialVqd (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider23Error("Failed to get initial vqd after multiple attempts", "INITIAL_VQD_ERROR", error);
        }
      }
    }
  }

  async *generateCompletionStream(messages) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        if (!this.vqd) {
          await this.getInitialVqd();
        }

        let payloadMessages = this.preparePayloadMessages(messages);

        const url = `${this.baseUrl}/chat`;
        const payload = {
          model: 'meta-llama/Llama-3-70b-chat-hf',
          messages: payloadMessages
        };

        const response = await axios.post(url, payload, {
          headers: { ...this.getChatHeaders(this.vqd), 'x-vqd-4': this.vqd },
          responseType: 'stream'
        });

        if (response.headers['x-vqd-4']) {
          this.vqd = response.headers['x-vqd-4'];
          Logger.info(`Provider23: Updated vqd from response: ${this.vqd}`);
        }

        let assistantResponse = '';

        for await (const chunk of response.data) {
          const lines = chunk.toString().split('\n');
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                if (data.message !== undefined) {
                  assistantResponse += data.message;
                  yield {
                    choices: [{
                      delta: { content: data.message },
                      index: 0,
                      finish_reason: null
                    }]
                  };
                }
              } catch (parseError) {
                Logger.warn('Provider23: Error parsing stream data:', parseError);
              }
            }
          }
        }

        this.newMessages.push({
          role: 'assistant',
          content: assistantResponse
        });

        return;
      } catch (error) {
        Logger.error(`Provider23: Error in generateCompletionStream (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider23Error("Failed to generate completion stream after multiple attempts", "STREAM_GENERATION_ERROR", error);
        }
      }
    }
  }

  async generateCompletion(messages) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        if (!this.vqd) {
          await this.getInitialVqd();
        }

        let payloadMessages = this.preparePayloadMessages(messages);

        const url = `${this.baseUrl}/chat`;
        const payload = {
          model: 'meta-llama/Llama-3-70b-chat-hf',
          messages: payloadMessages
        };

        const response = await axios.post(url, payload, {
          headers: { ...this.getChatHeaders(this.vqd), 'x-vqd-4': this.vqd },
          responseType: 'text'
        });

        if (response.headers['x-vqd-4']) {
          this.vqd = response.headers['x-vqd-4'];
        }

        const data = response.data;

        const lines = data.split('\n');
        let fullMessage = '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const jsonData = JSON.parse(line.slice(6));
              if (jsonData.message) {
                fullMessage += jsonData.message;
              }
            } catch (error) {
              Logger.warn('Provider23: Error parsing response data:', error);
            }
          }
        }

        if (fullMessage) {
          this.newMessages.push({
            role: 'assistant',
            content: fullMessage
          });

          return {
            content: fullMessage,
            usage: {
              prompt_tokens: -1,
              completion_tokens: -1,
              total_tokens: -1
            }
          };
        } else {
          throw new Provider23Error('No content in provider response', 'EMPTY_RESPONSE');
        }
      } catch (error) {
        Logger.error(`Provider23: Error in generateCompletion (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider23Error("Failed to generate completion after multiple attempts", "COMPLETION_GENERATION_ERROR", error);
        }
      }
    }
  }

  preparePayloadMessages(messages) {
    if (!this.historyMessage) {
      const historyContent = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
      this.historyMessage = {
        role: 'user',
        content: `This is the conversation history, read it carefully and use it in your response, also pay attention to roles, if you see system message, please pay A LOT OF ATTENTION to it: ${historyContent}`
      };
      return [this.historyMessage];
    } else {
      const newMessage = messages[messages.length - 1];
      this.newMessages.push(newMessage);
      return [this.historyMessage, ...this.newMessages];
    }
  }

  getStatusHeaders() {
    return {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
      'Cache-Control': 'no-store',
      'Referer': 'https://duckduckgo.com/',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
      'X-Vqd-Accept': '1'
    };
  }

  getChatHeaders(vqd) {
    return {
      'Accept': 'text/event-stream',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
      'Content-Type': 'application/json',
      'Cookie': 'ah=ru-ru; l=ru-ru; dcm=3',
      'Origin': 'https://duckduckgo.com',
      'Referer': 'https://duckduckgo.com/',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
      'X-Vqd-4': vqd
    };
  }
}

module.exports = Provider23;