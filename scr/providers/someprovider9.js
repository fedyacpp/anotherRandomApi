const axios = require('axios');
const uuid = require('uuid');
const ProviderInterface = require('./ProviderInterface');
const { SocksProxyAgent } = require('socks-proxy-agent');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');

class Provider9 extends ProviderInterface {
    constructor() {
        super();
        this.baseUrl = "https://liaobots.work";
        this.authCode = "";
        this.gkp2Cookie = "";
        this.modelInfo = {
            modelId: "gpt-4",
            name: "gpt-4",
            description: "Once the best model from OpenAI",
            context_window: 8000,
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
        this.balance = 0;
        this.lastBalance = 0;
        this.currentProxy = null;
    }

    getHeaders() {
        return {
            'authority': 'liaobots.com',
            'content-type': 'application/json',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/112.0.0.0 Safari/537.36',
            'x-auth-code': this.authCode,
            'Cookie': this.gkp2Cookie
        };
    }

    getAxiosConfig() {
        const config = { headers: this.getHeaders() };
        if (this.currentProxy) {
            config.httpsAgent = new SocksProxyAgent(this.currentProxy.proxy);
        }
        return config;
    }

    async initialize() {
        if (!proxyManager.isInitialized()) {
            await proxyManager.initialize();
        }
        await this.switchProxy();
        await this.login();
        await this.getUserInfo();
        await this.checkBalance();
    }

    async switchProxy() {
        this.currentProxy = proxyManager.getProxy();
        Logger.info(`Switched to proxy: ${this.currentProxy.proxy}`);
        await this.login();
        await this.getUserInfo();
    }

    async login() {
        try {
            Logger.info('Attempting to login...');
            const response = await axios.post(`${this.baseUrl}/recaptcha/api/login`, 
                { token: "abcdefghijklmnopqrst" },
                { headers: { 'Content-Type': 'application/json' } }
            );
            
            if (response.headers['set-cookie']) {
                const cookieHeader = response.headers['set-cookie'].find(cookie => cookie.startsWith('gkp2='));
                if (cookieHeader) {
                    this.gkp2Cookie = cookieHeader.split(';')[0];
                    Logger.info('Login successful, gkp2 cookie obtained');
                }
            }
            if (!this.gkp2Cookie) {
                throw new Error('Failed to obtain gkp2 cookie');
            }
        } catch (error) {
            Logger.error(`Login failed: ${error.message}`);
            throw error;
        }
    }

    async getUserInfo() {
        try {
            Logger.info('Getting user info...');
            const response = await axios.post(`${this.baseUrl}/api/user`,
                { authcode: this.authCode },
                this.getAxiosConfig()
            );
            this.authCode = response.data.authCode;
            this.lastBalance = this.balance;
            this.balance = response.data.balance;
            Logger.info(`User info retrieved. Auth code: ${this.authCode}, Balance: ${this.balance}`);
        } catch (error) {
            Logger.error(`Failed to get user info: ${error.message}`);
            throw error;
        }
    }

    async checkBalance() {
        if (this.balance === this.lastBalance) {
            Logger.info('Balance unchanged, switching proxy...');
            await this.switchProxy();
        } else if (this.balance < 0.03) {
            Logger.info('Balance too low, generating new auth code...');
            await this.generateNewAuthCode();
        }
    }

    async generateNewAuthCode() {
        try {
            await this.login();
            await this.getUserInfo();
        } catch (error) {
            Logger.error(`Failed to generate new auth code: ${error.message}`);
            throw error;
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens) {
        try {
            await this.initialize();

            Logger.info('Starting chat stream...');
            const response = await axios.post(`${this.baseUrl}/api/chat`,
                {
                    conversationId: uuid.v4(),
                    model: this.ModelInfo,
                    messages: messages,
                    key: "",
                    prompt: "You are a helpful assistant."
                },
                { 
                    ...this.getAxiosConfig(),
                    responseType: 'stream'
                }
            );

            for await (const chunk of response.data) {
                const chunkStr = chunk.toString();
                if (chunkStr) {
                    yield {
                        choices: [{
                            delta: { content: chunkStr },
                            index: 0,
                            finish_reason: null
                        }]
                    };
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
            Logger.error(`Error in completion stream: ${error.message}`);
            if (error.response) {
                Logger.error(`Response status: ${error.response.status}`);
                Logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
            }
            throw error;
        }
    }
}

module.exports = Provider9;