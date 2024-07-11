const axios = require('axios');
const uuid = require('uuid');
const https = require('https');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider9Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider9Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider9 extends ProviderInterface {
    constructor() {
        super();
        this.baseUrl = "https://liaobots.work";
        this.modelInfo = {
            modelId: "gpt-4",
            name: "gpt-4",
            description: "A groundbreaking language model that set new standards for AI capabilities and problem-solving",
            context_window: 8192,
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting"
        };
        this.ModelInfo = {
            "id": "gpt-4-0613",
            "name": "GPT-4-0613",
            "maxLength": 32000,
            "tokenLimit": 7600,
            "model": "ChatGPT",
            "provider": "OpenAI",
            "context": "8K"
        };
        this.authCode = null;
        this.cookieJar = null;
        this.maxAttempts = 3;
        this.rateLimiter = {
            tokens: 100,
            refillRate: 50,
            lastRefill: Date.now(),
            capacity: 500
        };
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
            httpsAgent: new https.Agent({ 
                rejectUnauthorized: false,
                keepAlive: true,
                maxSockets: 100
            }),
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
            throw new Provider9Error('Failed to refresh authentication', 'AUTH_REFRESH_ERROR', error);
        }
    }

    async makeRequest(endpoint, data, stream = false) {
        await this.waitForRateLimit();
        
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
            throw new Provider9Error(`Error making request to ${endpoint}`, 'REQUEST_ERROR', error);
        }
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
                        throw new Provider9Error('Invalid session', 'INVALID_SESSION');
                    }
                    fullContent += chunkStr;
                }
    
                fullContent = fullContent.replace(/\s+/g, ' ').trim();
    
                return { content: fullContent };
            } catch (error) {
                Logger.error(`Error in completion (attempt ${attempt + 1}): ${error.message}`);
                if (error instanceof Provider9Error && error.code === 'INVALID_SESSION') {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw new Provider9Error('Failed to generate completion', 'COMPLETION_ERROR', error);
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
                        throw new Provider9Error('Invalid session', 'INVALID_SESSION');
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
    
                return;
            } catch (error) {
                Logger.error(`Error in completion stream (attempt ${attempt + 1}): ${error.message}`);
                if (error instanceof Provider9Error && error.code === 'INVALID_SESSION') {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw new Provider9Error('Failed to generate completion stream', 'STREAM_ERROR', error);
                }
            }
        }
    }
}

module.exports = Provider9;