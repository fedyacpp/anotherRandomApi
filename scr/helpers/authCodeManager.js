const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');
const Logger = require('./logger');
const { HttpsProxyAgent } = require('https-proxy-agent');

class AuthCodeManager {
    constructor() {
        this.authCodeFile = path.join(__dirname, '..', '..', 'authCodes.json');
        this.authCodes = [];
        this.minBalance = 0.04;
        this.authBaseUrl = "https://liaobots.work";
        this.requestDelay = 5000;
        this.zeroBalanceDelay = 40000;
        this.blockedAuthCodes = new Set();
        this.proxyConfig = {
            host: '',
            port: ,
            auth: {
                username: '',
                password: ''
            }
        };
    }

    async initialize() {
        await this.loadAuthCodes();
        Logger.info(`AuthCodeManager initialized successfully with ${this.authCodes.length} auth codes`);
    }

    async loadAuthCodes() {
        try {
            const data = await fs.readFile(this.authCodeFile, 'utf8');
            const parsedData = JSON.parse(data);
            this.authCodes = parsedData.authCodes || [];
            this.blockedAuthCodes = new Set(parsedData.blockedAuthCodes || []);
            Logger.info(`Loaded ${this.authCodes.length} auth codes and ${this.blockedAuthCodes.size} blocked codes`);
            
            this.authCodes.forEach((code, index) => {
                Logger.info(`Auth code ${index + 1}: ${code.code}, Balance: ${code.balance}`);
            });
        } catch (error) {
            Logger.error(`Error loading auth codes: ${error.message}`);
            this.authCodes = [];
            this.blockedAuthCodes = new Set();
        }
    }

    async saveAuthCodes() {
        const dataToSave = {
            authCodes: this.authCodes,
            blockedAuthCodes: Array.from(this.blockedAuthCodes)
        };
        await fs.writeFile(this.authCodeFile, JSON.stringify(dataToSave, null, 2));
        Logger.info(`Saved ${this.authCodes.length} auth codes and ${this.blockedAuthCodes.size} blocked codes`);
    }

    async getValidAuthCode() {
        Logger.info(`Checking ${this.authCodes.length} auth codes for validity`);
        const validCodes = this.authCodes.filter(code => code.balance >= this.minBalance);
        Logger.info(`Found ${validCodes.length} valid auth codes`);
        
        if (validCodes.length > 0) {
            const validCode = validCodes[0];
            Logger.info(`Using existing auth code: ${validCode.code} with balance ${validCode.balance}`);
            return validCode;
        }
        
        Logger.info('No valid auth codes found. Generating a new one...');
        return this.generateAuthCode();
    }

    async generateAuthCode() {
        try {
            Logger.info('Generating new auth code...');
            const loginResponse = await axios.post(
                `${this.authBaseUrl}/recaptcha/api/login`,
                { token: "abcdefghijklmnopqrst" },
                this.getAxiosConfig()
            );
            const cookieJar = loginResponse.headers['set-cookie'];

            await this.delay(this.requestDelay);

            const userInfoResponse = await axios.post(
                `${this.authBaseUrl}/api/user`,
                { authcode: "" },
                {
                    ...this.getAxiosConfig(),
                    headers: {
                        ...this.getAxiosConfig().headers,
                        Cookie: cookieJar
                    }
                }
            );

            const newAuthCode = {
                code: userInfoResponse.data.authCode,
                balance: userInfoResponse.data.balance,
                cookies: cookieJar
            };

            if (newAuthCode.balance > 0) {
                this.authCodes.push(newAuthCode);
                await this.saveAuthCodes();
                Logger.info(`New auth code generated. Code: ${newAuthCode.code}, Balance: ${newAuthCode.balance}`);
            } else {
                Logger.warn(`Generated auth code has zero balance. It will be blocked.`);
                this.blockedAuthCodes.add(newAuthCode.code);
                await this.saveAuthCodes();
            }

            return newAuthCode;
        } catch (error) {
            Logger.error(`Failed to generate new auth code: ${error.message}`);
            throw error;
        }
    }

    getAxiosConfig(authCode = '') {
        const httpsAgent = new HttpsProxyAgent(`http://${this.proxyConfig.auth.username}:${this.proxyConfig.auth.password}@${this.proxyConfig.host}:${this.proxyConfig.port}`);
        
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

    async updateAuthCodeBalance(code, newBalance) {
        const authCode = this.authCodes.find(auth => auth.code === code);
        if (authCode) {
            Logger.info(`Updating balance for auth code ${code}: ${authCode.balance} -> ${newBalance}`);
            authCode.balance = newBalance;
            if (newBalance < this.minBalance) {
                this.removeAuthCode(code);
            }
            await this.saveAuthCodes();
        }
    }

    removeAuthCode(code) {
        this.authCodes = this.authCodes.filter(auth => auth.code !== code);
        this.blockedAuthCodes.add(code);
        Logger.info(`Removed auth code ${code} due to low balance`);
    }

    isAuthError(error) {
        return error.response?.status === 402 || error.response?.status === 401 || error.message.includes('Invalid session');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = new AuthCodeManager();