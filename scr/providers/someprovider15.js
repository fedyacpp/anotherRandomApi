const axios = require('axios');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const AuthCodeManager = require('../helpers/authCodeManager');

class Provider10Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider10Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider10 extends ProviderInterface {
    constructor() {
        super();
        this.apiBaseUrl = "https://ai.liaobots.work/v1";
        this.modelInfo = {
            modelId: "gpt-4o",
            name: "gpt-4o",
            description: "Points to gpt-4o-2024-05-13",
            context_window: 128000,
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting for auth tokens"
        };
        this.authCodeManager = new AuthCodeManager();
        this.maxAttempts = 5;
        this.requiresInitialization = true;
    }

    async initialize() {
        try {
            Logger.info('Initializing Provider10...');
            await this.authCodeManager.initialize();
            Logger.info('Provider10 initialized');
        } catch (error) {
            Logger.error(`Failed to initialize Provider10: ${error.message}`);
            throw new Provider10Error('Failed to initialize', 'INIT_ERROR', error);
        }
    }

    async getValidAuthCode() {
        return await this.authCodeManager.getValidAuthCode();
    }

    async makeRequest(endpoint, data, stream = false) {
        let attempts = 0;
        while (attempts < this.maxAttempts) {
            try {
                const authCode = await this.getValidAuthCode();
                if (!authCode) {
                    throw new Provider10Error('No valid auth code available', 'AUTH_CODE_ERROR');
                }
                const config = {
                    headers: {
                        'Authorization': `Bearer ${authCode}`,
                        'Content-Type': 'application/json'
                    }
                };
                if (stream) {
                    config.responseType = 'stream';
                }
    
                Logger.info(`Making request to ${endpoint} (Attempt ${attempts + 1})`);
                const response = await axios.post(`${this.apiBaseUrl}${endpoint}`, data, config);
                Logger.info(`Request successful`);
                return response;
            } catch (error) {
                Logger.error(`Request error (attempt ${attempts + 1}): ${error.message}`);
                if (error.response?.status === 401 || error.response?.status === 402) {
                    Logger.info(`Received auth error. Moving current auth code to blocked list...`);
                    const currentAuthCode = error.config.headers['Authorization'].split(' ')[1];
                    await this.authCodeManager.moveAuthCodeToBlocked(currentAuthCode);
                }
                attempts++;
                if (attempts >= this.maxAttempts) {
                    throw new Provider10Error(`Max attempts reached for request to ${endpoint}`, 'MAX_ATTEMPTS_ERROR', error);
                }
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }

    async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
        try {
            const response = await this.makeRequest('/chat/completions', {
                model: this.modelInfo.modelId,
                messages,
                temperature,
                max_tokens,
                functions,
                function_call,
                stream: false
            });
            
            if (!response.data || !response.data.choices || response.data.choices.length === 0) {
                throw new Provider10Error('Invalid response format from API', 'INVALID_RESPONSE_FORMAT');
            }
    
            return {
                content: response.data.choices[0].message.content,
                usage: response.data.usage
            };
        } catch (error) {
            throw new Provider10Error('Failed to generate completion', 'COMPLETION_ERROR', error);
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens) {
        try {
            const response = await this.makeRequest('/chat/completions', {
                model: this.modelInfo.modelId,
                messages,
                temperature,
                max_tokens,
                stream: true
            }, true);

            let buffer = '';
            let isFinished = false;
            for await (const chunk of response.data) {
                buffer += chunk.toString();
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const jsonData = line.slice(6);
                        if (jsonData === '[DONE]') {
                            isFinished = true;
                            break;
                        }
                        try {
                            const data = JSON.parse(jsonData);
                            if (data.choices && data.choices[0].delta) {
                                if (data.choices[0].finish_reason === "stop") {
                                    isFinished = true;
                                    if (data.choices[0].delta.content) {
                                        yield data;
                                    }
                                    break;
                                }
                                yield data;
                            }
                        } catch (parseError) {
                            Logger.warn(`Error parsing JSON: ${parseError.message}. Skipping line: ${line}`);
                        }
                    }
                }
                if (isFinished) break;
            }
            if (buffer.length > 0) {
                Logger.warn(`Unprocessed data in buffer: ${buffer}`);
            }
        } catch (error) {
            throw new Provider10Error('Failed to generate completion stream', 'STREAM_ERROR', error);
        }
    }
}

module.exports = Provider10;