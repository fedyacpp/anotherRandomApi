const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const axios = require('axios');
const crypto = require('crypto');

class Provider20 extends ProviderInterface {
  constructor(options = {}) {
    super();
    this.baseUrl = 'https://www.zaimaai.cn/api/zaimaai/chat';
    this.modelInfo = {
      modelId: "gpt-3.5-turbo",
      name: "gpt-3.5-turbo",
      description: "OpenAI's GPT-3.5 Turbo model",
      context_window: "4096",
      author: "OpenAI",
      unfiltered: false,
      reverseStatus: "Testing",
      devNotes: ""
    };
  }

  generateFingerprint() {
    return crypto.randomBytes(16).toString('hex');
  }

  generateSessionId() {
    return Math.random().toString(36).substring(2, 12).toUpperCase();
  }

  async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
    try {
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
            throw new Error(`API Error: ${response.data.message}`);
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
        Logger.error('Provider20: Error in generateCompletion:', error);
        throw error; 
    }
}

async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
    try {
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
            throw new Error('Unexpected response format');
        }

        if (typeof fullResponse !== 'string' || fullResponse.trim().length === 0) {
            throw new Error('Invalid or empty response content');
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
            await new Promise(resolve => setTimeout(resolve, 50));
        }

        yield {
            choices: [{
                delta: {},
                index: 0,
                finish_reason: "stop"
            }]
        };

    } catch (error) {
        Logger.error('Provider20: Error in generateCompletionStream:', error.message);
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
        throw error;
    }
}
}

module.exports = Provider20;