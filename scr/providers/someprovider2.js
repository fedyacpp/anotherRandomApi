const axios = require('axios');
const uuid = require('uuid');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const proxyManager = require('../helpers/proxyManager');
const https = require('https');
const util = require('util');

class Provider2 extends ProviderInterface {
    constructor() {
        super();
        this.baseUrl = "https://liaobots.work";
        this.authCode = "";
        this.gkp2Cookie = "";
        this.modelInfo = {
            modelId: "gpt-4-turbo",
            name: "gpt-4-turbo",
            description: "Predecessor of gpt-4o, still performs well",
            context_window: 128000,
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting"
        };
        this.ModelInfo = {
            "id": "gpt-4-turbo-2024-04-09",
            "name": "GPT-4-Turbo",
            "maxLength": 260000,
            "tokenLimit": 126000,
            "model": "ChatGPT",
            "provider": "OpenAI",
            "context": "128K"
        };
        this.balance = 0;
        this.lastBalance = 0;
        this.currentProxy = null;
        this.useProxy = false;
        this.proxyAttempts = 0;
        this.isInitializing = false;
        this.userAgents = [
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15',
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0',
            'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36'
        ];
        this.authCodes = [];
        this.currentAuthCodeIndex = 0;
        this.proxyTimeout = 10000;
        this.useProxyFallback = true;
        this.maxRedirects = 5;
        this.maxProxyAttempts = 3;
        this.maxAuthAttempts = 5;
    }

    getHeaders() {
        return {
            'authority': 'liaobots.com',
            'content-type': 'application/json',
            'origin': this.baseUrl,
            'referer': `${this.baseUrl}/`,
            'user-agent': this.userAgents[Math.floor(Math.random() * this.userAgents.length)],
            'x-auth-code': this.authCode,
            'Cookie': this.gkp2Cookie
        };
    }

    getAxiosConfig() {
        const config = { 
            headers: this.getHeaders(),
            httpsAgent: new https.Agent({ rejectUnauthorized: false }),
            timeout: this.proxyTimeout,
            maxRedirects: 0,
            validateStatus: function (status) {
                return status >= 200 && status < 400;
            }
        };
        if (this.useProxy && this.currentProxy) {
            config.proxy = {
                host: this.currentProxy.ip,
                port: this.currentProxy.port,
                protocol: 'http'
            };
        }
        return config;
    }
    
        async initialize() {
            if (this.isInitializing) {
                await this.waitForInitialization();
                return;
            }
    
            this.isInitializing = true;
            try {
                if (!proxyManager.isInitialized()) {
                    await proxyManager.initialize();
                }
                this.proxyAttempts = 0;
                await this.refreshAllAuthCodes();
                await this.checkBalance();
            } finally {
                this.isInitializing = false;
            }
        }

        async refreshAllAuthCodes() {
            this.authCodes = [];
            for (let i = 0; i < this.maxAuthAttempts; i++) {
                try {
                    await this.login();
                    const userInfo = await this.getUserInfo();
                    if (userInfo.authCode) {
                        this.authCodes.push({
                            code: userInfo.authCode,
                            balance: userInfo.balance
                        });
                        if (userInfo.balance > 0) {
                            Logger.info(`Found auth code with positive balance: ${userInfo.balance}`);
                            this.authCode = userInfo.authCode;
                            this.balance = userInfo.balance;
                            return;
                        }
                    }
                } catch (error) {
                    Logger.error(`Failed to refresh auth code (attempt ${i + 1}): ${error.message}`);
                    if (error.response && error.response.status === 500) {
                        Logger.info('Received 500 error. Waiting before retry...');
                        await new Promise(resolve => setTimeout(resolve, 5000));
                        continue;
                    }
                }
                if (i < this.maxAuthAttempts - 1) {
                    await this.switchProxy();
                }
            }
            if (this.authCodes.length === 0) {
                throw new Error('Failed to obtain any valid auth codes');
            }
        }
        
        async getValidAuthCode() {
            if (this.authCode && this.balance > 0) {
                return;
            }
    
            for (let i = 0; i < this.maxAuthAttempts; i++) {
                for (const authData of this.authCodes) {
                    this.authCode = authData.code;
                    try {
                        const userInfo = await this.getUserInfo();
                        if (userInfo.balance > 0) {
                            this.balance = userInfo.balance;
                            Logger.info(`Found valid auth code with positive balance: ${this.balance}`);
                            return;
                        }
                    } catch (error) {
                        Logger.error(`Error checking auth code balance: ${error.message}`);
                        if (error.response && error.response.status === 500) {
                            Logger.info('Received 500 error. Waiting before retry...');
                            await new Promise(resolve => setTimeout(resolve, 5000));
                            continue;
                        }
                    }
                }
                
                if (i < this.maxAuthAttempts - 1) {
                    Logger.info('All auth codes have zero balance or failed. Switching proxy and retrying...');
                    await this.switchProxy();
                }
            }
            throw new Error('Unable to find auth code with positive balance after multiple attempts');
        }
    
        async waitForInitialization(timeout = 30000) {
            const startTime = Date.now();
            while (this.isInitializing) {
                if (Date.now() - startTime > timeout) {
                    throw new Error('Initialization timeout');
                }
                await new Promise(resolve => setTimeout(resolve, 100));
            }
        }
    
        async switchProxy() {
            this.proxyAttempts++;
            if (this.proxyAttempts >= this.maxProxyAttempts) {
                Logger.info('Max proxy attempts reached. Switching to no-proxy mode.');
                this.useProxy = false;
                this.currentProxy = null;
                return;
            }
    
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
            this.currentProxy = proxyManager.getProxy();
            this.useProxy = true;
            Logger.info(`Switched to proxy: ${this.currentProxy.ip}:${this.currentProxy.port}. Attempt ${this.proxyAttempts}`);
        }

        async makeRequest(url, method, data = null) {
            let redirectCount = 0;
            let originalUrl = url;
            while (redirectCount < this.maxRedirects) {
                try {
                    const config = this.getAxiosConfig();
                    const response = await axios({
                        ...config,
                        method: method,
                        url: url,
                        data: data
                    });
        
                    if (response.status >= 300 && response.status < 400) {
                        const newUrl = new URL(response.headers.location, url).toString();
                        Logger.info(`Redirect ${redirectCount + 1}: ${url} -> ${newUrl}`);
                        url = newUrl;
                        redirectCount++;
                    } else {
                        if (redirectCount > 0) {
                            Logger.info(`Request completed after ${redirectCount} redirects. Final URL: ${url}`);
                        }
                        return response;
                    }
                } catch (error) {
                    if (error.response && error.response.status >= 300 && error.response.status < 400) {
                        const newUrl = new URL(error.response.headers.location, url).toString();
                        Logger.info(`Redirect ${redirectCount + 1}: ${url} -> ${newUrl}`);
                        url = newUrl;
                        redirectCount++;
                    } else {
                        Logger.error(`Request failed at ${url}. Original URL: ${originalUrl}`);
                        Logger.error(`Error: ${error.message}`);
                        if (error.response) {
                            Logger.error(`Status: ${error.response.status}`);
                            Logger.error(`Headers: ${JSON.stringify(error.response.headers)}`);
                        }
                        throw error;
                    }
                }
            }
            throw new Error(`Max redirects (${this.maxRedirects}) exceeded. Original URL: ${originalUrl}, Last URL: ${url}`);
        }

        async login() {
            try {
                Logger.info('Attempting to login...');
                const response = await this.makeRequest(`${this.baseUrl}/recaptcha/api/login`, 'POST', { token: "abcdefghijklmnopqrst" });
                
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
            const response = await this.makeRequest(`${this.baseUrl}/api/user`, 'POST', { authcode: this.authCode });
            const userInfo = response.data;
            this.authCode = userInfo.authCode;
            this.balance = userInfo.balance;
            Logger.info(`User info retrieved. Auth code: ${this.authCode}, Balance: ${this.balance}`);
            return userInfo;
        } catch (error) {
            Logger.error(`Failed to get user info: ${error.message}`);
            throw error;
        }
    }
    
        async checkBalance() {
            let validAuthCodeFound = false;
            for (let i = 0; i < this.authCodes.length; i++) {
                this.authCode = this.authCodes[i];
                const userInfo = await this.getUserInfo();
                if (userInfo.balance > 0) {
                    this.balance = userInfo.balance;
                    this.currentAuthCodeIndex = i;
                    validAuthCodeFound = true;
                    break;
                }
            }
            if (!validAuthCodeFound) {
                throw new Error('No auth codes with positive balance found');
            }
        }
    
        async generateNewAuthCode() {
            Logger.info('Generating new auth code...');
            try {
                await this.login();
                await this.getUserInfo();
                Logger.info('New auth code generated successfully');
            } catch (error) {
                Logger.error(`Failed to generate new auth code: ${error.message}`);
                throw error;
            }
        }
    
        isInitialized() {
            return this.authCode && this.gkp2Cookie && this.balance > 0;
        }
    
        async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
            if (!this.isInitialized() && !this.isInitializing) {
                this.initialize().catch(error => Logger.error(`Initialization error: ${error.message}`));
            }
    
            await this.waitForInitialization();
    
            if (!this.isInitialized()) {
                throw new Error('Provider is not initialized');
            }
    
            try {
                Logger.info('Starting chat completion...');
                const response = await axios.post(`${this.baseUrl}/api/chat`,
                    {
                        conversationId: uuid.v4(),
                        model: this.ModelInfo,
                        messages: messages,
                        key: "",
                        prompt: "You are a helpful assistant.",
                        temperature: temperature,
                        max_tokens: max_tokens
                    },
                    this.getAxiosConfig()
                );
    
                if (!response.data || !response.data.message || !response.data.message.content) {
                    throw new Error('Invalid response from server');
                }
    
                const result = {
                    content: response.data.message.content,
                    usage: {
                        prompt_tokens: response.data.usage?.prompt_tokens ?? -1,
                        completion_tokens: response.data.usage?.completion_tokens ?? -1,
                        total_tokens: response.data.usage?.total_tokens ?? -1
                    }
                };
    
                if (response.data.message.function_call) {
                    result.function_call = response.data.message.function_call;
                }
    
                await this.checkBalance();
                if (this.currentProxy) {
                    proxyManager.updateProxyScore(this.currentProxy, true);
                }
    
                return result;
            } catch (error) {
                Logger.error(`Error in completion: ${error.message}`);
                if (error.response) {
                    Logger.error(`Response status: ${error.response.status}`);
                    Logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
                }
                
                if (this.currentProxy) {
                    proxyManager.updateProxyScore(this.currentProxy, false);
                }
    
                if (error.response && error.response.status === 429) {
                    const retryAfter = parseInt(error.response.headers['retry-after']) || 60;
                    Logger.info(`Rate limited. Waiting for ${retryAfter} seconds before retry.`);
                    await new Promise(resolve => setTimeout(resolve, retryAfter * 1000));
                    return this.generateCompletion(messages, temperature, max_tokens, functions, function_call);
                }
                
                if (this.proxyAttempts < this.maxProxyAttempts) {
                    Logger.info('Switching proxy due to completion failure');
                    await this.switchProxy();
                    return this.generateCompletion(messages, temperature, max_tokens, functions, function_call);
                }
                
                throw error;
            }
        }
    
        async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
            if (!this.isInitialized() && !this.isInitializing) {
                await this.initialize().catch(error => {
                    Logger.error(`Initialization error: ${error.message}`);
                    throw error;
                });
            }
    
            await this.waitForInitialization();
    
            if (!this.isInitialized()) {
                throw new Error('Provider is not initialized');
            }
    
            let retries = 3;
            while (retries > 0) {
                try {
                    await this.getValidAuthCode();
    
                    Logger.info('Starting chat stream...');
                    const response = await this.makeRequest(
                        `${this.baseUrl}/api/chat`,
                        'POST',
                        {
                            conversationId: uuid.v4(),
                            model: this.ModelInfo,
                            messages: messages,
                            key: "",
                            prompt: "You are a helpful assistant.",
                            temperature: temperature,
                            max_tokens: max_tokens
                        }
                    );
        
                    let accumulatedData = '';
                    for await (const chunk of response.data) {
                        accumulatedData += chunk.toString();
                        let processedData = accumulatedData;
                        accumulatedData = '';
        
                        const lines = processedData.split('\n');
                        for (const line of lines) {
                            if (line.trim() === '') continue;
                            if (line.startsWith('data: ')) {
                                const jsonData = line.slice(6);
                                try {
                                    const parsedData = JSON.parse(jsonData);
                                    if (parsedData.choices && parsedData.choices.length > 0) {
                                        yield {
                                            choices: [{
                                                delta: { content: parsedData.choices[0].delta.content || '' },
                                                index: 0,
                                                finish_reason: parsedData.choices[0].finish_reason || null
                                            }]
                                        };
                                    }
                                } catch (parseError) {
                                    Logger.error(`Error parsing stream data: ${parseError.message}`);
                                }
                            } else {
                                accumulatedData += line + '\n';
                            }
                        }
                    }
        
                    yield {
                        choices: [{
                            delta: {},
                            index: 0,
                            finish_reason: "stop"
                        }]
                    };
        
                    await this.checkBalance();
                    if (this.currentProxy) {
                        proxyManager.updateProxyScore(this.currentProxy, true);
                    }
                    return;
        
                } catch (error) {
                    Logger.error(`Error in completion stream: ${error.message}`);
                    if (error.response) {
                        Logger.error(`Response status: ${error.response.status}`);
                        Logger.error(`Response data: ${util.inspect(error.response.data, { depth: 1 })}`);
                    }
    
                    if (this.currentProxy) {
                        proxyManager.updateProxyScore(this.currentProxy, false);
                    }
    
                    if (error.response && (error.response.status === 402 || error.response.status === 429 || error.response.status === 500)) {
                        Logger.info(`Received ${error.response.status} error. Attempting to refresh auth code...`);
                        await this.refreshAllAuthCodes();
                        continue;
                    }
    
                    retries--;
                    if (retries > 0) {
                        Logger.info(`Retrying... Attempts left: ${retries}`);
                        await this.switchProxy();
                    } else {
                        throw new Error('Max retries reached. Unable to complete the request.');
                    }
                }
            }
    
            throw new Error('Failed to generate completion after multiple attempts');
        }

        async retryWithDelay(fn, retries = 3, delay = 1000) {
            for (let i = 0; i < retries; i++) {
                try {
                    return await fn();
                } catch (error) {
                    if (i === retries - 1) throw error;
                    await new Promise(resolve => setTimeout(resolve, delay));
                }
            }
        }
    
        async refreshSession() {
            Logger.info('Refreshing session...');
            let attempts = 0;
            const maxAttempts = 5;
        
            while (attempts < maxAttempts) {
                try {
                    await this.login();
                    await this.getUserInfo();
                    if (this.balance > 0) {
                        Logger.info('Session refreshed successfully.');
                        return;
                    }
                    Logger.info(`Balance still negative (${this.balance}). Switching proxy and retrying...`);
                    await this.switchProxy();
                } catch (error) {
                    Logger.error(`Failed to refresh session: ${error.message}`);
                }
                attempts++;
            }
        
            throw new Error('Failed to refresh session after multiple attempts.');
        }
    }
    
    module.exports = Provider2;