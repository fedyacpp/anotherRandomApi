const axios = require('axios');
const Logger = require('./logger');

class ProxyManager {
    constructor() {
        this.proxyList = [];
        this.proxyUrl = 'https://sunny9577.github.io/proxy-scraper/generated/http_proxies.txt';
        this.maxProxiesToFetch = 300;
        this.maxProxiesToKeep = 50;
        this.testUrl = 'http://httpbin.org/ip';
        this.timeout = 3000;
        this.currentProxyIndex = 0;
    }

    async fetchProxies() {
        try {
            const response = await axios.get(this.proxyUrl);
            return response.data.split('\n')
                .filter(line => line.trim())
                .slice(0, this.maxProxiesToFetch)
                .map(line => {
                    const [ip, port] = line.split(':');
                    return { ip, port: parseInt(port), protocol: 'http' };
                });
        } catch (error) {
            Logger.error(`Error fetching proxies: ${error.message}`);
            return [];
        }
    }

    async testProxy(proxy) {
        const startTime = Date.now();
        try {
            await axios.get(this.testUrl, {
                proxy: {
                    host: proxy.ip,
                    port: proxy.port,
                    protocol: proxy.protocol
                },
                timeout: this.timeout
            });
            const responseTime = Date.now() - startTime;
            return { ...proxy, responseTime, score: 1 };
        } catch (error) {
            return null;
        }
    }

    async getProxy() {
        if (this.proxyList.length === 0 || this.currentProxyIndex >= this.proxyList.length) {
            await this.refreshProxyList();
        }

        if (this.proxyList.length === 0) {
            Logger.warn('No working proxies available');
            return null;
        }

        const proxy = this.proxyList[this.currentProxyIndex];
        this.currentProxyIndex = (this.currentProxyIndex + 1) % this.proxyList.length;
        return proxy;
    }

    async refreshProxyList() {
        const rawProxies = await this.fetchProxies();
        Logger.info(`Fetched ${rawProxies.length} proxies. Testing...`);

        const testedProxies = await Promise.all(
            rawProxies.map(proxy => this.testProxy(proxy))
        );

        this.proxyList = testedProxies
            .filter(proxy => proxy !== null)
            .sort((a, b) => a.responseTime - b.responseTime)
            .slice(0, this.maxProxiesToKeep);

        this.currentProxyIndex = 0;
        Logger.info(`Found ${this.proxyList.length} working proxies`);
    }

    startPeriodicUpdate(interval = 1000 * 60 * 3) {
        this.updateInterval = setInterval(() => {
            this.refreshProxyList().catch(error => {
                Logger.error(`Error in periodic proxy update: ${error.message}`);
            });
        }, interval);
    }

    stopPeriodicUpdate() {
        if (this.updateInterval) {
            clearInterval(this.updateInterval);
            this.updateInterval = null;
            Logger.info('Stopped periodic proxy updates');
        }
    }

    async initialize() {
        try {
            Logger.info('Initializing proxy manager...');
            await this.refreshProxyList();
            this.startPeriodicUpdate();
            Logger.info('Proxy manager initialized successfully');
        } catch (error) {
            Logger.error(`Failed to initialize proxy manager: ${error.message}`);
            throw error;
        }
    }

    updateProxyScore(proxy, success) {
        const proxyIndex = this.proxyList.findIndex(p => p.ip === proxy.host && p.port === proxy.port);
        if (proxyIndex !== -1) {
            if (success) {
                this.proxyList[proxyIndex].score += 1;
            } else {
                this.proxyList[proxyIndex].score -= 1;
                if (this.proxyList[proxyIndex].score <= 0) {
                    this.proxyList.splice(proxyIndex, 1);
                    Logger.info(`Removed non-working proxy: ${proxy.host}:${proxy.port}`);
                }
            }
        }
    }

    isInitialized() {
        return this.proxyList.length > 0;
    }
}

module.exports = new ProxyManager();