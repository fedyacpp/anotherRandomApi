const axios = require('axios');
const uuid = require('uuid');
const https = require('https');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider33Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider33Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider33 extends ProviderInterface {
    constructor() {
        super();
        this.authBaseUrl = "https://liaobots.work";
        this.apiBaseUrl = "https://ai.liaobots.work/v1";
        this.modelAlias = "gpt-3.5-turbo";
        this.modelInfo = {
            modelId: "gpt-3.5-turbo-0125",
            name: "gpt-3.5-turbo-0125",
            description: "The latest iteration of GPT-3.5 Turbo, offering significant enhancements in performance and a broader range of capabilities",
            context_window: 16384,
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting for auth tokens"
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
        this.lastAuthRefresh = 0;
        this.authRefreshInterval = 1 * 60 * 1000;
        this.balance = 0;
    }

    getHeaders(forAuth = false) {
        const headers = {
            'Content-Type': 'application/json',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
        };
        if (forAuth) {
            headers['Origin'] = this.authBaseUrl;
            headers['Referer'] = `${this.authBaseUrl}/`;
        } else if (this.authCode) {
            headers['Authorization'] = `Bearer ${this.authCode}`;
        }
        return headers;
    }

    getAxiosConfig(forAuth = false) {
        return {
            headers: this.getHeaders(forAuth),
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
                `${this.authBaseUrl}/recaptcha/api/login`,
                { token: "abcdefghijklmnopqrst" },
                this.getAxiosConfig(true)
            );
            this.cookieJar = loginResponse.headers['set-cookie'];
            Logger.info('Login successful, cookies obtained');

            const userInfoResponse = await axios.post(
                `${this.authBaseUrl}/api/user`,
                { authcode: "" },
                {
                    ...this.getAxiosConfig(true),
                    headers: {
                        ...this.getHeaders(true),
                        Cookie: this.cookieJar
                    }
                }
            );
            this.authCode = userInfoResponse.data.authCode;
            this.balance = userInfoResponse.data.balance;
            Logger.info(`Auth code obtained: ${this.authCode}, Balance: ${this.balance}`);

            if (this.balance < 0.05) {
                Logger.warn(`Low balance: ${this.balance}. Consider topping up.`);
            }
        } catch (error) {
            Logger.error(`Failed to refresh auth code: ${error.message}`);
            throw new Provider33Error('Failed to refresh authentication', 'AUTH_REFRESH_ERROR', error);
        }
    }

    async ensureValidAuth() {
        const now = Date.now();
        if (now - this.lastAuthRefresh > this.authRefreshInterval || this.balance < 0.05) {
            await this.refreshAuthCode();
            this.lastAuthRefresh = now;
        }
    }

    async makeRequest(endpoint, data, stream = false) {
        await this.ensureValidAuth();
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
            throw new Provider33Error(`Error making request to ${endpoint}`, 'REQUEST_ERROR', error);
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
        await this.ensureValidAuth();
    
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await axios.post(
                    `${this.apiBaseUrl}/chat/completions`,
                    {
                        model: this.modelAlias,
                        messages,
                        temperature,
                        max_tokens,
                        stream: false
                    },
                    this.getAxiosConfig()
                );
    
                return response.data.choices[0].message;
            } catch (error) {
                Logger.error(`Error in completion (attempt ${attempt + 1}): ${error.message}`);
                if (error.response?.status === 401) {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw new Provider33Error('Failed to generate completion', 'COMPLETION_ERROR', error);
                }
            }
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens) {
        await this.ensureValidAuth();
    
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await axios.post(
                    `${this.apiBaseUrl}/chat/completions`,
                    {
                        model: this.modelAlias,
                        messages,
                        temperature,
                        max_tokens,
                        stream: true
                    },
                    {
                        ...this.getAxiosConfig(),
                        responseType: 'stream'
                    }
                );
    
                let buffer = '';
                for await (const chunk of response.data) {
                    buffer += chunk.toString();
                    let processBuffer = buffer;
                    buffer = '';

                    while (true) {
                        const newlineIndex = processBuffer.indexOf('\n');
                        if (newlineIndex === -1) {
                            buffer = processBuffer;
                            break;
                        }

                        const line = processBuffer.slice(0, newlineIndex).trim();
                        processBuffer = processBuffer.slice(newlineIndex + 1);

                        if (line.startsWith('data: ')) {
                            try {
                                const jsonData = line.slice(6);
                                if (jsonData === '[DONE]') {
                                    return;
                                }
                                const data = JSON.parse(jsonData);
                                if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                    yield {
                                        choices: [{
                                            delta: { content: data.choices[0].delta.content },
                                            index: 0,
                                            finish_reason: data.choices[0].finish_reason
                                        }]
                                    };
                                }
                            } catch (parseError) {
                                Logger.warn(`Error parsing JSON: ${parseError.message}. Skipping line: ${line}`);
                            }
                        }
                    }
                }
    
                if (buffer.trim()) {
                    Logger.warn(`Unprocessed data in buffer: ${buffer}`);
                }
    
                return;
            } catch (error) {
                Logger.error(`Error in completion stream (attempt ${attempt + 1}): ${error.message}`);
                if (error.response?.status === 401) {
                    await this.refreshAuthCode();
                } else if (attempt === this.maxAttempts - 1) {
                    throw new Provider33Error('Failed to generate completion stream', 'STREAM_ERROR', error);
                }
            }
        }
    }
}

module.exports = Provider33;