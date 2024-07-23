const axios = require('axios');
const uuid = require('uuid');
const https = require('https');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider26Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider26Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider26 extends ProviderInterface {
    constructor() {
        super();
        this.baseUrl = "https://api.deepinfra.com";
        this.modelName = "nvidia/Nemotron-4-340B-Instruct"
        this.modelInfo = {
            modelId: "nemotron-4-340B-instruct",
            name: "nemotron-4-340B-instruct",
            description: "A large language model by NVIDIA",
            context_window: 4096,
            author: "NVIDIA",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP rate limit"
        };
        this.maxAttempts = 3;
        this.rateLimiter = {
            tokens: 100,
            refillRate: 50,
            lastRefill: Date.now(),
            capacity: 500
        };
    }

    getHeaders() {
        return {
            'Accept': 'text/event-stream',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
            'Content-Type': 'application/json',
            'Origin': 'https://deepinfra.com',
            'Referer': 'https://deepinfra.com/',
            'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-site',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
            'X-Deepinfra-Source': 'model-embed'
        };
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
    }

    async makeRequest(endpoint, data, stream = false) {
        await this.waitForRateLimit();
        
        const config = this.getAxiosConfig();
        if (stream) {
            config.responseType = 'stream';
        }

        try {
            const response = await axios.post(`${this.baseUrl}${endpoint}`, data, config);
            return response;
        } catch (error) {
            throw new Provider26Error(`Error making request to ${endpoint}`, 'REQUEST_ERROR', error);
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
                const response = await this.makeRequest('/v1/openai/chat/completions', {
                    model: this.modelName,
                    messages,
                    stream: false,
                    temperature,
                    max_tokens
                }, false);

                return { content: response.data.choices[0].message.content };
            } catch (error) {
                Logger.error(`Error in completion (attempt ${attempt + 1}): ${error.message}`);
                if (attempt === this.maxAttempts - 1) {
                    throw new Provider26Error('Failed to generate completion', 'COMPLETION_ERROR', error);
                }
            }
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens) {
        for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
            try {
                const response = await this.makeRequest('/v1/openai/chat/completions', {
                    model: this.modelName,
                    messages,
                    stream: true,
                    temperature,
                    max_tokens
                }, true);
    
                let buffer = '';
                for await (const chunk of response.data) {
                    buffer += chunk.toString();
                    let lines = buffer.split('\n');
                    buffer = lines.pop();
    
                    for (const line of lines) {
                        if (line.trim() === '') continue;
                        if (line.trim() === 'data: [DONE]') {
                            return;
                        }
                        if (line.startsWith('data: ')) {
                            try {
                                const jsonData = JSON.parse(line.slice(6));
                                if (jsonData.choices && jsonData.choices[0].delta.content) {
                                    yield {
                                        choices: [{
                                            delta: { content: jsonData.choices[0].delta.content },
                                            index: 0,
                                            finish_reason: jsonData.choices[0].finish_reason
                                        }]
                                    };
                                }
                            } catch (jsonError) {
                                Logger.warn(`Failed to parse JSON: ${line.slice(6)}`);
                                continue;
                            }
                        }
                    }
                }
    
                if (buffer.trim() !== '') {
                    if (buffer.trim() === 'data: [DONE]') {
                        return;
                    }
                    if (buffer.startsWith('data: ')) {
                        try {
                            const jsonData = JSON.parse(buffer.slice(6));
                            if (jsonData.choices && jsonData.choices[0].delta.content) {
                                yield {
                                    choices: [{
                                        delta: { content: jsonData.choices[0].delta.content },
                                        index: 0,
                                        finish_reason: jsonData.choices[0].finish_reason
                                    }]
                                };
                            }
                        } catch (jsonError) {
                            Logger.warn(`Failed to parse JSON in remaining buffer: ${buffer.slice(6)}`);
                        }
                    }
                }
    
                return;
            } catch (error) {
                Logger.error(`Error in completion stream (attempt ${attempt + 1}): ${error.message}`);
                if (attempt === this.maxAttempts - 1) {
                    throw new Provider26Error('Failed to generate completion stream', 'STREAM_ERROR', error);
                }
            }
        }
    }
}

module.exports = Provider26;