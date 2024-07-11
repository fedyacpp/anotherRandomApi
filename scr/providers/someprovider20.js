const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const axios = require('axios');
const crypto = require('crypto');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider20Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider20Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider20 extends ProviderInterface {
  constructor(options = {}) {
    super();
    this.baseUrl = 'https://www.zaimaai.cn/api/zaimaai/chat';
    this.modelInfo = {
      modelId: "gpt-3.5-turbo",
      name: "gpt-3.5-turbo",
      description: "A versatile and efficient language model, widely used for various AI applications",
      context_window: 4096,
      author: "OpenAI",
      unfiltered: false,
      reverseStatus: "Testing",
      devNotes: ""
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

  generateFingerprint() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
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

  async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        const fingerprint = this.generateFingerprint();
        const sessionId = this.generateSessionId();
        
        const response = await axios.post(this.baseUrl, {
          messages: messages,
          is_sse: false,
          service: "openaigpt",
          model: "gpt-3.5-turbo",
          temperature: temperature || 0.7,
          max_tokens: max_tokens,
          presence_penalty: 0,
          visitor_id: fingerprint,
          session_id: sessionId,
          app_name: "zaimaai_web",
          prompt: messages,
          functions: functions,
          function_call: function_call
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `fingerprint=${fingerprint}`
          }
        });

        if (response.data.code !== "0") {
          throw new Provider20Error(`API Error: ${response.data.message}`, "API_ERROR");
        }

        return {
          content: response.data.data,
          usage: {
            prompt_tokens: -1,
            completion_tokens: -1,
            total_tokens: -1
          }
        };
      } catch (error) {
        Logger.error(`Provider20: Error in generateCompletion (attempt ${retries + 1}):`, error);
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider20Error("Failed to generate completion after multiple attempts", "COMPLETION_GENERATION_ERROR", error);
        }
      }
    }
  }

  async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
    let retries = 0;
    while (retries < this.maxRetries) {
      try {
        await this.waitForRateLimit();
        const fingerprint = this.generateFingerprint();
        const sessionId = this.generateSessionId();
        
        const response = await axios.post(this.baseUrl, {
          messages: messages,
          is_sse: true,
          service: "openaigpt",
          model: "gpt-3.5-turbo",
          temperature: temperature || 0.7,
          max_tokens: max_tokens,
          presence_penalty: 0,
          visitor_id: fingerprint,
          session_id: sessionId,
          app_name: "zaimaai_web",
          prompt: messages,
          functions: functions,
          function_call: function_call
        }, {
          headers: {
            'Content-Type': 'application/json',
            'Cookie': `fingerprint=${fingerprint}`
          },
          timeout: 30000
        });

        let fullResponse;
        if (typeof response.data === 'string') {
          fullResponse = response.data;
        } else if (response.data && response.data.data) {
          fullResponse = response.data.data;
        } else {
          throw new Provider20Error('Unexpected response format', "INVALID_RESPONSE_FORMAT");
        }

        if (typeof fullResponse !== 'string' || fullResponse.trim().length === 0) {
          throw new Provider20Error('Invalid or empty response content', "EMPTY_RESPONSE");
        }

        const words = fullResponse.split(/\s+/);

        for (let i = 0; i < words.length; i++) {
          yield {
            choices: [{
              delta: { content: words[i] + (i < words.length - 1 ? ' ' : '') },
              index: 0,
              finish_reason: null
            }]
          };
          await sleep(50);
        }

        return;
      } catch (error) {
        Logger.error(`Provider20: Error in generateCompletionStream (attempt ${retries + 1}):`, error);
        if (error.response) {
          Logger.error('Provider20: Error response:', {
            status: error.response.status,
            headers: error.response.headers,
            data: error.response.data
          });
        } else if (error.request) {
          Logger.error('Provider20: Error request:', error.request);
        } else {
          Logger.error('Provider20: Error details:', error.message);
        }
        retries++;
        if (retries < this.maxRetries) {
          await sleep(this.retryDelay * Math.pow(2, retries));
        } else {
          throw new Provider20Error("Failed to generate completion stream after multiple attempts", "STREAM_GENERATION_ERROR", error);
        }
      }
    }
  }
}

module.exports = Provider20;