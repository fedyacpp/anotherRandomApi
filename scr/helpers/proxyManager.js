const axios = require('axios');
const Logger = require('./logger');

class ProxyManager {
    constructor() {
        this.proxyList = [];
        this.usedProxies = new Set();
        this.proxyScores = new Map();
        this.proxyUrl = 'https://sunny9577.github.io/proxy-scraper/generated/http_proxies.txt';
        this.maxProxies = 250;
        this.initializationPromise = null;
    }

    async fetchProxies() {
        try {
            const response = await axios.get(this.proxyUrl);
            const proxies = response.data.split('\n')
                .filter(line => line.trim())
                .slice(0, this.maxProxies)
                .map(line => {
                    const [ip, port] = line.split(':');
                    return { ip, port: parseInt(port), protocol: 'http' };
                });
            Logger.info(`Fetched ${proxies.length} proxies`);
            return proxies;
        } catch (error) {
            Logger.error(`Error fetching proxies: ${error.message}`);
            return [];
        }
    }

    async verifyProxy(proxy, timeout = 5000) {
        const testUrl = 'http://httpbin.org/ip';
        try {
            const response = await axios.get(testUrl, {
                proxy: {
                    host: proxy.ip,
                    port: proxy.port,
                    protocol: proxy.protocol
                },
                timeout: timeout
            });
            return response.status === 200;
        } catch (error) {
            return false;
        }
    }

    async refreshProxyList() {
        const rawProxies = await this.fetchProxies();
        const verificationPromises = rawProxies.map(proxy => this.verifyProxy(proxy));
        const results = await Promise.all(verificationPromises);

        this.proxyList = rawProxies.filter((_, index) => results[index]);
        this.usedProxies.clear();
        this.proxyScores.clear();
        this.proxyList.forEach(proxy => {
            this.proxyScores.set(`${proxy.ip}:${proxy.port}`, 0);
        });
        Logger.info(`Verified ${this.proxyList.length} working proxies`);
    }

    getProxy() {
        const availableProxies = this.proxyList.filter(proxy => !this.usedProxies.has(`${proxy.ip}:${proxy.port}`));
        if (availableProxies.length === 0) {
            this.usedProxies.clear();
            return this.getBestProxy();
        }
        return this.getBestProxy(availableProxies);
    }

    getBestProxy(proxyList = this.proxyList) {
        return proxyList.reduce((best, current) => {
            const bestScore = this.proxyScores.get(`${best.ip}:${best.port}`) || 0;
            const currentScore = this.proxyScores.get(`${current.ip}:${current.port}`) || 0;
            return currentScore > bestScore ? current : best;
        });
    }

    updateProxyScore(proxy, success) {
        const key = `${proxy.ip}:${proxy.port}`;
        const currentScore = this.proxyScores.get(key) || 0;
        const newScore = success ? currentScore + 1 : Math.max(0, currentScore - 1);
        this.proxyScores.set(key, newScore);
    }

    async initialize() {
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                try {
                    Logger.info('Initializing proxy manager...');
                    await this.refreshProxyList();
                    Logger.info('Proxy manager initialized successfully');
                } catch (error) {
                    Logger.error(`Failed to initialize proxy manager: ${error.message}`);
                    throw error;
                }
            })();
        }
        return this.initializationPromise;
    }

    isInitialized() {
        return this.initializationPromise !== null && this.proxyList.length > 0;
    }
}

module.exports = new ProxyManager();