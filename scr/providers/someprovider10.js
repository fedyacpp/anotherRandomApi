const axios = require('axios');
const uuid = require('uuid');
const https = require('https');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');

class Provider10 extends ProviderInterface {
    constructor() {
        super();
        this.baseUrl = "https://liaobots.work";
        this.modelInfo = {
            modelId: "gpt-3.5-turbo-16k",
            name: "gpt-3.5-turbo-16k",
            description: "An enhanced version of GPT-3.5 with expanded context capacity, suitable for longer conversations",
            context_window: 16384,
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting"
        };
        this.ModelInfo = {
            "id": "gpt-3.5-turbo",
            "name": "GPT-3.5-Turbo",
            "maxLength": 48000,
            "tokenLimit": 14000,
            "model": "ChatGPT",
            "provider": "OpenAI",
            "context": "16K"
        };
        this.authCode = null;
        this.cookieJar = null;
        this.maxAttempts = 3;
    }

    getHeaders() {
        const headers = {
            'authority': 'liaobots.com',
            'content-type': 'application/json',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
        };
        if (this.authCode) {
            headers['x-auth-code'] = this.authCode;
        }
        return headers;
    }

    getAxiosConfig() {
        return {
            headers: this.getHeaders(),
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: 60000,
            validateStatus: status => status >= 200 && status < 400
        };
    }

    async initialize() {
        if (!proxyManager.isInitialized()) {
            await proxyManager.initialize();
        }
        await this.refreshAuthCode();
    }

    async refreshAuthCode() {
        try {
            Logger.info('Attempting to login...');
            const loginResponse = await axios.post(
                `${this.baseUrl}/recaptcha/api/login`,
                { token: "abcdefghijklmnopqrst" },
                this.getAxiosConfig()
            );
            this.cookieJar = loginResponse.headers['set-cookie'];
            Logger.info('Login successful, cookies obtained');

            const userInfoResponse = await axios.post(
                `${this.baseUrl}/api/user`,
                { authcode: "" },
                {
                    ...this.getAxiosConfig(),
                    headers: {
                        ...this.getHeaders(),
                        Cookie: this.cookieJar
                    }
                }
            );
            this.authCode = userInfoResponse.data.authCode;
            Logger.info(`Auth code obtained: ${this.authCode}, Balance: ${userInfoResponse.data.balance}`);
        } catch (error) {
            Logger.error(`Failed to refresh auth code: ${error.message}`);
            throw error;
        }
    }

    async makeRequest(endpoint, data, stream = false) {
        const config = {
            ...this.getAxiosConfig(),
            headers: {
                ...this.getHeaders(),
                Cookie: this.cookieJar
            }
        };
        if (stream) {
            config.responseType = 'stream';
        }

        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, data, config);
            return response;
        } catch (error) {
            if (error.response?.status === 402 || error.message.includes('Invalid session')) {
                Logger.info(`Received error: ${error.message}. Refreshing auth code...`);
                await this.refreshAuthCode();
                return this.makeRequest(endpoint, data, stream);
            }
            throw error;
        }
    }

    async generateCompletion(messages, temperature, max_tokens) {
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await this.makeRequest('/api/chat', {
                    conversationId: uuid.v4(),
                    model: this.ModelInfo,
                    messages,
                    key: "",
                    prompt: "You are a helpful assistant.",
                    temperature,
                    max_tokens
                }, true);

                let fullContent = '';
                for await (const chunk of response.data) {
                    const chunkStr = chunk.toString();
                    if (chunkStr.includes('<html')) {
                        throw new Error('Invalid session');
                    }
                    fullContent += chunkStr;
                }
    
                fullContent = fullContent.replace(/\s+/g, ' ').trim();
    
                return { content: fullContent };
            } catch (error) {
                Logger.error(`Error in completion (attempt ${attempt + 1}): ${error.message}`);
                if (error.message.includes('Invalid session')) {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw error;
                }
            }
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens) {
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await this.makeRequest('/api/chat', {
                    conversationId: uuid.v4(),
                    model: this.ModelInfo,
                    messages,
                    key: "",
                    prompt: "You are a helpful assistant.",
                    temperature,
                    max_tokens
                }, true);
    
                let buffer = '';
                for await (const chunk of response.data) {
                    const chunkStr = chunk.toString();
                    if (chunkStr.includes('<html')) {
                        throw new Error('Invalid session');
                    }
                    buffer += chunkStr;
                    
                    while (buffer.includes(' ')) {
                        const index = buffer.indexOf(' ');
                        const part = buffer.slice(0, index).trim();
                        if (part) {
                            yield {
                                choices: [{
                                    delta: { content: part + ' ' },
                                    index: 0,
                                    finish_reason: null
                                }]
                            };
                        }
                        buffer = buffer.slice(index + 1);
                    }
                }
    
                if (buffer.trim()) {
                    yield {
                        choices: [{
                            delta: { content: buffer.trim() },
                            index: 0,
                            finish_reason: null
                        }]
                    };
                }
    
                yield {
                    choices: [{
                        delta: {},
                        index: 0,
                        finish_reason: "stop"
                    }]
                };
    
                return;
            } catch (error) {
                Logger.error(`Error in completion stream (attempt ${attempt + 1}): ${error.message}`);
                if (error.message.includes('Invalid session')) {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw error;
                }
            }
        }
    }
}

module.exports = Provider10;