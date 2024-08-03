const axios = require('axios');
const { HttpsProxyAgent } = require('https-proxy-agent');
const Logger = require('./logger');
const path = require('path');
const fs = require('fs').promises;
const dotenv = require('dotenv');
const ProxySelector = require('./proxySelector');

dotenv.config();

class AuthCodeManager {
    constructor() {
        this.authBaseUrl = "https://liaobots.work";
        this.requestDelay = 5000;
        this.maxRetries = 3;
        this.authCodes = [];
        this.blockedAuthCodes = [];
        this.authCodeFile = path.join(__dirname, '..', '..', 'authCodes.json');
        this.minBalance = 0.02;
    }

    async initialize() {
        await this.loadAuthCodes();
        Logger.info(`AuthCodeManager initialized with ${this.authCodes.length} auth codes and ${this.blockedAuthCodes.length} blocked codes`);
    }

    async loadAuthCodes() {
        try {
            const data = await fs.readFile(this.authCodeFile, 'utf8');
            const parsedData = JSON.parse(data);
            this.authCodes = parsedData.authCodes || [];
            this.blockedAuthCodes = parsedData.blockedAuthCodes || [];
            Logger.info(`Loaded ${this.authCodes.length} auth codes and ${this.blockedAuthCodes.length} blocked codes`);
        } catch (error) {
            Logger.warn(`Error loading auth codes: ${error.message}. Starting with empty lists.`);
            this.authCodes = [];
            this.blockedAuthCodes = [];
        }
    }

    async saveAuthCodes() {
        try {
            const dataToSave = {
                authCodes: this.authCodes,
                blockedAuthCodes: this.blockedAuthCodes
            };
            await fs.writeFile(this.authCodeFile, JSON.stringify(dataToSave, null, 2));
            Logger.info(`Saved ${this.authCodes.length} auth codes and ${this.blockedAuthCodes.length} blocked codes`);
            
            const savedData = await fs.readFile(this.authCodeFile, 'utf8');
            const parsedSavedData = JSON.parse(savedData);
            if (parsedSavedData.authCodes.length !== this.authCodes.length) {
                Logger.error('Verification failed: Saved auth codes count does not match');
            } else {
                Logger.info('Verification successful: Auth codes saved correctly');
            }
        } catch (error) {
            Logger.error(`Error saving auth codes: ${error.message}`);
        }
    }

    async getValidAuthCode() {
        let validCode = this.authCodes.find(code => code.balance >= this.minBalance);
        
        if (validCode) {
            Logger.info(`Using existing auth code: ${validCode.code}`);
            return validCode.code;
        }
        
        await this.loadAuthCodes();
        
        validCode = this.authCodes.find(code => code.balance >= this.minBalance);
        
        if (validCode) {
            Logger.info(`Using auth code from file: ${validCode.code}`);
            return validCode.code;
        }
        
        Logger.info('No valid auth codes found. Generating a new one...');
        const newCode = await this.generateAuthCode();
        if (newCode) {
            this.authCodes.push(newCode);
            await this.saveAuthCodes();
            return newCode.code;
        }
        
        throw new Error('Failed to get a valid auth code');
    }

    async updateAuthCodeBalance(code, newBalance) {
        const codeIndex = this.authCodes.findIndex(c => c.code === code);
        if (codeIndex !== -1) {
            this.authCodes[codeIndex].balance = newBalance;
            if (newBalance < this.minBalance) {
                this.authCodes.splice(codeIndex, 1);
                this.blockedAuthCodes.push(code);
                Logger.info(`Removed auth code ${code} due to low balance and added to blocked list`);
            }
            await this.saveAuthCodes();
            Logger.info(`Updated balance for auth code ${code}: ${newBalance}`);
        }
    }

    async generateAuthCode() {
        for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
            try {
                Logger.info(`Generating new auth code (Attempt ${attempt})...`);
                const axiosConfig = await this.getAxiosConfig();
                const loginResponse = await axios.post(
                    `${this.authBaseUrl}/recaptcha/api/login`,
                    { token: "abcdefghijklmnopqrst" },
                    axiosConfig
                );
                const cookieJar = loginResponse.headers['set-cookie'];
    
                await this.delay(this.requestDelay);
    
                const userInfoResponse = await axios.post(
                    `${this.authBaseUrl}/api/user`,
                    { authcode: "" },
                    {
                        ...axiosConfig,
                        headers: {
                            ...axiosConfig.headers,
                            Cookie: cookieJar
                        }
                    }
                );
    
                const newAuthCode = {
                    code: userInfoResponse.data.authCode,
                    balance: userInfoResponse.data.balance,
                    cookies: cookieJar
                };
    
                if (newAuthCode.balance === 0) {
                    Logger.warn(`Generated auth code ${newAuthCode.code} has zero balance. Blocking it.`);
                    this.blockedAuthCodes.push(newAuthCode.code);
                } else {
                    Logger.info(`Generated auth code: ${newAuthCode.code}, Balance: ${newAuthCode.balance}`);
                    this.authCodes.push(newAuthCode);
                }
    
                await this.saveAuthCodes();
    
                return newAuthCode.balance > 0 ? newAuthCode : null;
    
            } catch (error) {
                Logger.error(`Failed to generate new auth code (Attempt ${attempt}): ${error.message}`);
                if (error.response) {
                    Logger.error(`Response status: ${error.response.status}`);
                    Logger.error(`Response data: ${JSON.stringify(error.response.data)}`);
                }
                if (attempt === this.maxRetries) {
                    throw new Error(`Failed to generate auth code after ${this.maxRetries} attempts`);
                }
            }
            await this.delay(this.requestDelay);
        }
        return null;
    }

    async getAxiosConfig() {
        const proxy = await ProxySelector.getNextProxy();
        if (!proxy) {
            Logger.warn('No proxy available, proceeding without proxy');
            return {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                    'Origin': this.authBaseUrl,
                    'Referer': `${this.authBaseUrl}/`,
                },
                timeout: 60000
            };
        }
        
        const httpsAgent = new HttpsProxyAgent(`http://${proxy.auth.username}:${proxy.auth.password}@${proxy.host}:${proxy.port}`);
        
        return {
            headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Origin': this.authBaseUrl,
                'Referer': `${this.authBaseUrl}/`,
            },
            timeout: 60000,
            httpsAgent: httpsAgent,
            proxy: false
        };
    }
    
    async moveAuthCodeToBlocked(code) {
        const index = this.authCodes.findIndex(c => c.code === code);
        if (index !== -1) {
            const [removedCode] = this.authCodes.splice(index, 1);
            this.blockedAuthCodes.push(removedCode.code);
            Logger.info(`Moved auth code ${code} to blocked list`);
            await this.saveAuthCodes();
        } else {
            Logger.warn(`Auth code ${code} not found in active list`);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = AuthCodeManager;