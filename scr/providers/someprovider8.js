const { SocksProxyAgent } = require('socks-proxy-agent');
const uuid = require('uuid');
const ProviderInterface = require('./ProviderInterface');
const BrowserManager = require('../helpers/browser');
const axios = require('axios');
const Logger = require('../helpers/logger');

class Provider8 extends ProviderInterface {
    constructor(proxyList = []) {
        super();
        this.baseUrl = "https://liaobots.work";
        this._authCode = "";
        this.modelInfo = {
            modelId: "claude-3-haiku",
            name: "claude-3-haiku",
            description: "Lightweight model from Anthropic",
            context_window: 200000,
            author: "Anthropic",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP limiting"
          };
          this.ModelInfo = {
            "id": "claude-3-haiku-20240307",
            "name": "Claude-3-Haiku",
            "maxLength": 800000,
            "tokenLimit": 200000,
            "model": "Claude",
            "provider": "Anthropic",
            "context": "200K"
          };
        this.maxRetries = 3;
        this.retryDelay = 2000;
        this.minBalance = 0.05;
        this.proxyList = proxyList;
        this.currentProxy = null;
        this.agent = null;
        this.browserManager = new BrowserManager({ url: this.baseUrl });
        this.cookies = null;
        this.userAgents = [
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Safari/605.1.15",
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:89.0) Gecko/20100101 Firefox/89.0",
            "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/92.0.4515.107 Safari/537.36",
            "Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.1 Mobile/15E148 Safari/604.1"
        ];
        this.currentUserAgent = this.getRandomUserAgent();
    }

    getRandomUserAgent() {
        return this.userAgents[Math.floor(Math.random() * this.userAgents.length)];
    }

    getRandomProxy() {
        if (this.proxyList.length === 0) return null;
        return this.proxyList[Math.floor(Math.random() * this.proxyList.length)];
    }

    parseProxyString(proxyString) {
        const [protocol, host, port, username, password] = proxyString.split(':');
        return { protocol, host, port, username, password };
    }

    async createSession(retryCount = 0) {
        try {
            Logger.info('Creating new session');
            await this.resetData();
            await this.performHumanVerification();
            const userAuthData = await this.performUserAuth();
            
            if (userAuthData.balance <= this.minBalance) {
                Logger.warn(`Low balance: ${userAuthData.balance}. Resetting session.`);
                await this.resetData();
                return this.createSession(retryCount);
            }
            Logger.success('Session created successfully');
        } catch (error) {
            Logger.error(`Error creating session: ${error.message}`);
            if (retryCount < this.maxRetries) {
                Logger.info(`Retrying session creation. Attempt ${retryCount + 1} of ${this.maxRetries}`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.createSession(retryCount + 1);
            }
            const customError = new Error('Failed to create session after multiple attempts');
            customError.name = 'SessionCreationError';
            customError.originalError = error;
            throw customError;
        }
    }

    async resetData() {
        Logger.info('Resetting data');
        this._authCode = "";
        this.cookies = null;
        this.currentUserAgent = this.getRandomUserAgent();
        this.currentProxy = this.getRandomProxy();
        if (this.currentProxy) {
            const proxySettings = this.parseProxyString(this.currentProxy);
            this.agent = new SocksProxyAgent(`${proxySettings.protocol}://${proxySettings.host}:${proxySettings.port}`);
        } else {
            this.agent = null;
        }
        await this.browserManager.reset(this.currentProxy ? this.parseProxyString(this.currentProxy) : null);
        await this.browserManager.setUserAgent(this.currentUserAgent);
        Logger.info('Data reset complete');
    }

    async performHumanVerification() {
        try {
            Logger.info('Performing human verification');
            await this.browserManager.page.goto(this.baseUrl, { waitUntil: 'networkidle0', timeout: 30000 });

            await this.handleVerificationButton();

            const currentUrl = this.browserManager.page.url();
            if (!currentUrl.includes('liaobots.work/zh') && !currentUrl.includes('liaobots.work/en')) {
                throw new Error(`Unexpected URL after verification: ${currentUrl}`);
            }

            this._authCode = await this.browserManager.page.evaluate(() => localStorage.getItem('authCode'));
            if (!this._authCode) {
                throw new Error('Failed to retrieve authCode from localStorage');
            }

            this.cookies = await this.browserManager.page.cookies();
            Logger.success('Human verification complete');
        } catch (error) {
            Logger.error(`Human verification failed: ${error.message}`);
            const customError = new Error('Human verification failed');
            customError.name = 'VerificationError';
            customError.originalError = error;
            throw customError;
        }
    }

    async handleVerificationButton() {
        await this.browserManager.page.waitForSelector('.button', { timeout: 30000 });
        const navigationPromise = this.browserManager.page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 60000 });
        await this.browserManager.page.click('.button');
        await navigationPromise;
    }

    async performUserAuth() {
        try {
            Logger.info('Performing user authentication');
            const response = await this.makeRequest(`${this.baseUrl}/api/user`, {
                method: 'POST',
                body: JSON.stringify({ authcode: this._authCode }),
            });
            const data = await this.handleResponse(response, 'User Auth');
            if (data.authCode) {
                this._authCode = data.authCode;
                Logger.success('User authentication successful');
            } else {
                Logger.warn('User authentication completed, but no new authCode received');
            }
            return data;
        } catch (error) {
            Logger.error(`User authentication failed: ${error.message}`);
            const customError = new Error('User authentication failed');
            customError.name = 'AuthenticationError';
            customError.originalError = error;
            throw customError;
        }
    }

    async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
        Logger.info('Provider8: Generating completion stream');
        await this.ensureSession();
        const data = this.prepareRequestData(messages, temperature, max_tokens, functions, function_call);
    
        try {
            const response = await axios({
                method: 'post',
                url: `${this.baseUrl}/api/chat`,
                data: JSON.stringify(data),
                headers: this.getHeaders(),
                responseType: 'stream',
                httpsAgent: this.agent
            });
    
            let buffer = '';
            for await (const chunk of response.data) {
                buffer += chunk.toString();
                if (buffer.match(/[\s\.\?\!,;:]$/)) {
                    yield {
                        choices: [{
                            delta: { content: buffer },
                            index: 0,
                            finish_reason: null
                        }]
                    };
                    buffer = '';
                }
            }
            if (buffer) {
                yield {
                    choices: [{
                        delta: { content: buffer },
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
        } catch (error) {
            Logger.error(`Provider8: Error generating completion stream: ${error.message}`);
            throw error;
        }
    }

    async ensureSession() {
        Logger.info('Ensuring valid session');
        if (!this._authCode) {
            Logger.info('No authCode, creating new session');
            await this.createSession();
        } else {
            try {
                const userData = await this.performUserAuth();
                if (userData.balance <= this.minBalance) {
                    Logger.warn(`Low balance: ${userData.balance}. Creating new session.`);
                    await this.resetData();
                    await this.createSession();
                }
            } catch (error) {
                Logger.error(`Error ensuring session: ${error.message}`);
                const customError = new Error('Failed to ensure valid session');
                customError.name = 'SessionValidationError';
                customError.originalError = error;
                throw customError;
            }
        }
        Logger.success('Valid session ensured');
    }

    async makeRequest(url, options) {
        try {
            return await axios({
                url,
                method: options.method,
                data: options.body,
                headers: this.getHeaders(),
                httpsAgent: this.agent
            });
        } catch (error) {
            Logger.error(`Request failed: ${error.message}`);
            const customError = new Error('Request failed');
            customError.name = 'RequestError';
            customError.originalError = error;
            throw customError;
        }
    }
    
    async handleResponse(response, context) {
        try {
            if (response.status !== 200) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.data;
        } catch (error) {
            Logger.error(`Error handling response for ${context}: ${error.message}`);
            const customError = new Error(`Error handling response for ${context}`);
            customError.name = 'ResponseHandlingError';
            customError.originalError = error;
            throw customError;
        }
    }

    getHeaders() {
        const headers = {
            "X-Auth-Code": this._authCode,
            "Content-Type": "application/json",
            "Authority": "liaobots.com",
            "Origin": this.baseUrl,
            "Referer": `${this.baseUrl}/`,
            "User-Agent": this.currentUserAgent,
        };

        if (this.cookies) {
            headers['Cookie'] = this.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
        }

        return headers;
    }

    prepareRequestData(messages, temperature) {
        return {
            conversationId: uuid.v4(),
            model: this.ModelInfo,
            messages: messages,
            key: "",
            prompt: messages.find(m => m.role === 'system')?.content || "You are a helpful assistant made by OpenAI.",
            temperature: temperature || 0.7,
        };
    }

    async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
        Logger.info('Provider8: Generating completion');
        await this.ensureSession();
        const data = this.prepareRequestData(messages, temperature, max_tokens, functions, function_call);
    
        try {
            const response = await this.makeRequest(`${this.baseUrl}/api/chat`, {
                method: 'POST',
                body: JSON.stringify(data),
            });
    
            if (response.status !== 200) {
                Logger.error(`Provider8: HTTP error! status: ${response.status}, message: ${response.statusText}`);
                throw new Error(`HTTP error! status: ${response.status}, message: ${response.statusText}`);
            }
    
            const responseData = response.data;
    
            if (typeof responseData !== 'string') {
                Logger.error('Provider8: Unexpected response type');
                throw new Error('Unexpected response type');
            }
    
            return {
                content: responseData.trim(),
                usage: {
                    prompt_tokens: -1,
                    completion_tokens: -1,
                    total_tokens: -1
                }
            };
        } catch (error) {
            Logger.error(`Provider8: Error generating completion: ${error.message}`);
            throw error;
        }
    }
}

module.exports = Provider8;