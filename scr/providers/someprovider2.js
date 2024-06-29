const fetch = require('node-fetch');
const { SocksProxyAgent } = require('socks-proxy-agent');
const uuid = require('uuid');
const ProviderInterface = require('./ProviderInterface');
const Logger = require('../helpers/logger');
const BrowserManager = require('../helpers/browser');
const axios = require('axios');

class Provider2 extends ProviderInterface {
    constructor(proxyList = []) {
        super();
        this.baseUrl = "https://liaobots.work";
        this._authCode = "";
        this.modelInfo = {
          modelId: "gpt-4-turbo-2024-04-09",
          name: "gpt-4-turbo-2024-04-09",
          description: "Predecessor of gpt-4o",
          context_window: 128000,
          author: "OpenAI",
          unfiltered: true,
          reverseStatus: "Testing",
          devNotes: ""
        };
        this.ModelInfo = {
          "id": "gpt-4-turbo-preview",
          "name": "GPT-4-Turbo",
          "maxLength": 260000,
          "tokenLimit": 126000,
          "context": "128K",
        }
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
            await this.resetData();
            await this.performHumanVerification();
            const userAuthData = await this.performUserAuth();
            
            if (userAuthData.balance <= this.minBalance) {
                Logger.info('Balance is low. Resetting all data and re-verifying...');
                await this.resetData();
                return this.createSession(retryCount);
            }
            
            Logger.info('Session created successfully');
        } catch (error) {
            this.logError('Error in createSession', error);
            if (retryCount < this.maxRetries) {
                Logger.warn(`Retrying createSession (attempt ${retryCount + 1})`);
                await new Promise(resolve => setTimeout(resolve, this.retryDelay));
                return this.createSession(retryCount + 1);
            }
            throw error;
        }
    }

    async resetData() {
        this._authCode = "";
        this.cookies = null;
        this.currentUserAgent = this.getRandomUserAgent();
        this.currentProxy = this.getRandomProxy();
        if (this.currentProxy) {
            const proxySettings = this.parseProxyString(this.currentProxy);
            this.agent = new SocksProxyAgent(`${proxySettings.protocol}://${proxySettings.host}:${proxySettings.port}`);
            Logger.info(`Using proxy: ${this.currentProxy}`);
        } else {
            this.agent = null;
            Logger.info('No proxy available, using direct connection');
        }
        await this.browserManager.reset(this.currentProxy ? this.parseProxyString(this.currentProxy) : null);
        await this.browserManager.setUserAgent(this.currentUserAgent);
        Logger.info(`Reset data, changed User-Agent to: ${this.currentUserAgent}, and updated proxy settings`);
    }

    async performHumanVerification() {
      try {
          Logger.info(`Navigating to ${this.baseUrl}`);
          await this.browserManager.page.goto(this.baseUrl, { waitUntil: 'networkidle0', timeout: 60000 });
          
          await this.handleVerificationButton();
          
          const currentUrl = this.browserManager.page.url();
          Logger.info(`Current URL after navigation: ${currentUrl}`);
          
          if (!currentUrl.includes('liaobots.work/zh') && !currentUrl.includes('liaobots.work/en')) {
              throw new Error(`Unexpected URL after verification: ${currentUrl}`);
          }
          
          Logger.info('Human verification passed successfully');

          Logger.info('Attempting to retrieve authCode from localStorage');
          this._authCode = await this.browserManager.page.evaluate(() => {
              return localStorage.getItem('authCode');
          });

          if (!this._authCode) {
              throw new Error('Failed to retrieve authCode from localStorage');
          }

          Logger.info(`Retrieved authCode: ${this._authCode}`);
      } catch (error) {
          this.logError('Error during human verification', error);
          throw error;
      } finally {
          Logger.info('Retrieving cookies');
          this.cookies = await this.browserManager.page.cookies();
          Logger.info(`Retrieved ${this.cookies.length} cookies`);
      }
  }

  async handleVerificationButton() {
      Logger.info('Waiting for .button selector');
      await this.browserManager.page.waitForSelector('.button', { timeout: 30000 });
      
      Logger.info('Setting up navigation promise');
      const navigationPromise = this.browserManager.page.waitForNavigation({ 
          waitUntil: 'networkidle0',
          timeout: 60000 
      });
      
      Logger.info('Clicking the button');
      await this.browserManager.page.click('.button');
      
      Logger.info('Waiting for navigation to complete');
      await navigationPromise;
  }

  async performUserAuth() {
      try {
          const response = await this.makeRequest(`${this.baseUrl}/api/user`, {
              method: 'POST',
              body: JSON.stringify({ authcode: this._authCode }),
          });
          const data = await this.handleResponse(response, 'User Auth');
          if (data.authCode) {
              this._authCode = data.authCode;
              Logger.info(`Updated authCode: ${this._authCode}`);
          } else {
              Logger.warn('No authCode in the response, using the previous one');
          }
          Logger.info(`User balance: ${data.balance}`);
          if (data.balance <= 0) {
              Logger.warn('User has insufficient balance');
          }
          return data;
      } catch (error) {
          this.logError('Error in performUserAuth', error);
          throw error;
      }
  }

  async *generateCompletionStream(messages, temperature) {
    await this.ensureSession();
    const data = this.prepareRequestData(messages, temperature);

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
                yield this.formatStreamResponse(buffer);
                buffer = '';
            }
        }

        if (buffer) {
            yield this.formatStreamResponse(buffer);
        }

        yield this.formatStreamResponse(null, true);
    } catch (error) {
        this.logError('Error in generateCompletionStream', error);
        throw error;
    }
}

  async ensureSession() {
      if (!this._authCode) {
          await this.createSession();
      } else {
          try {
              const userData = await this.performUserAuth();
              if (userData.balance <= this.minBalance) {
                  Logger.info('Balance is low. Resetting all data and re-verifying...');
                  await this.resetData();
                  await this.createSession();
              }
          } catch (error) {
              Logger.warn('Error checking session, creating a new one');
              await this.resetData();
              await this.createSession();
          }
      }
  }

  async makeRequest(url, options) {
    const response = await axios({
        url,
        method: options.method,
        data: options.body,
        headers: this.getHeaders(),
        httpsAgent: this.agent
    });
    return response;
}

async handleResponse(response, context) {
  const data = response.data;
  Logger.info(`Response in ${context}: ${JSON.stringify(data)}`);
  return data;
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
          const cookieString = this.cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
          headers['Cookie'] = cookieString;
      }

      return headers;
  }

  prepareRequestData(messages, temperature) {
      return {
          conversationId: uuid.v4(),
          model: this.ModelInfo,
          messages: messages,
          key: "",
          prompt: messages.find(m => m.role === 'system')?.content || "You are a helpful assistant.",
          temperature: temperature || 0.7,
      };
  }

  formatStreamResponse(content, isFinished = false) {
    if (isFinished) {
        return {
            choices: [{
                delta: {},
                index: 0,
                finish_reason: "stop"
            }]
        };
    }
    return {
        choices: [{
            delta: { content: content },
            index: 0,
            finish_reason: null
        }]
    };
}

formatLine(line) {
  return line.replace(/([a-z])([A-Z])/g, '$1 $2')
             .replace(/([A-Z])([A-Z][a-z])/g, '$1 $2')
             .replace(/([.,!?;:])([a-zA-Z])/g, '$1 $2');
}

  logError(context, error) {
      Logger.error(`${context}:`);
      if (error instanceof Error) {
          Logger.error(`Error name: ${error.name}`);
          Logger.error(`Error message: ${error.message}`);
          Logger.error(`Error stack: ${error.stack}`);
      } else {
          Logger.error(`Non-Error object thrown: ${JSON.stringify(error)}`);
      }
  }

  async generateCompletion(messages, temperature) {
      await this.ensureSession();
      const data = this.prepareRequestData(messages, temperature);

      try {
          const response = await this.makeRequest(`${this.baseUrl}/api/chat`, {
              method: 'POST',
              body: JSON.stringify(data),
          });

          if (!response.ok) {
              const errorText = await response.text();
              Logger.error(`Error response: ${errorText}`);
              throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
          }

          const fullResponse = await response.text();
          return { content: fullResponse.trim() };
      } catch (error) {
          this.logError('Error in generateCompletion', error);
          throw error;
      }
    }
  }
    
    module.exports = Provider2;