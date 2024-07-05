const axios = require('axios');
const { SocksProxyAgent } = require('socks-proxy-agent');
const Logger = require('./logger');

class ProxyManager {
    constructor() {
        this.proxyList = [];
        this.usedProxies = new Set();
        this.preferredCountries = new Set([
            'RU', 'KZ', 'BY', 'UA', 'PL', 'FI', 'EE', 'LV', 'LT', 'MD',
            'US', 'DE', 'NL', 'FR', 'GB', 'JP', 'KR', 'SG', 'AU'
        ]);
        this.checkServices = [
            'http://httpbin.org/ip',
            'http://ifconfig.me/ip',
            'http://icanhazip.com'
        ];
        this.currentServiceIndex = 0;
        this.batchSize = 20;
        this.delayBetweenChecks = 100;
        this.initializationPromise = null;
    }

    async fetchProxies() {
        try {
            const response = await axios.get('https://raw.githubusercontent.com/proxifly/free-proxy-list/main/proxies/protocols/socks5/data.json');
            return response.data.filter(proxy => 
                proxy.geolocation.country !== 'ZZ' &&
                this.preferredCountries.has(proxy.geolocation.country)
            );
        } catch (error) {
            Logger.error(`Error fetching proxies: ${error.message}`);
            return [];
        }
    }

    async verifyProxy(proxy, timeout = 2000) {
        const agent = new SocksProxyAgent(proxy.proxy);
        const service = this.checkServices[this.currentServiceIndex];
        this.currentServiceIndex = (this.currentServiceIndex + 1) % this.checkServices.length;
        
        try {
            const startTime = Date.now();
            const response = await axios.get(service, {
                httpsAgent: agent,
                timeout: timeout
            });
            const responseTime = Date.now() - startTime;
            
            if (response.status === 200) {
                return { success: true, responseTime };
            }
        } catch (error) {
            Logger.debug(`Proxy check failed for ${proxy.proxy}: ${error.message}`);
        }
        
        return { success: false, responseTime: Infinity };
    }

    calculateProxyScore(responseTime) {
        return Math.max(0, 100 - responseTime / 20);
    }

    async refreshProxyList() {
        const rawProxies = await this.fetchProxies();
        Logger.info(`Fetched ${rawProxies.length} proxies`);

        const workingProxies = [];
        for (let i = 0; i < rawProxies.length; i += this.batchSize) {
            const batch = rawProxies.slice(i, i + this.batchSize);
            const results = await Promise.all(batch.map(proxy => this.verifyProxy(proxy)));
            
            results.forEach((result, index) => {
                if (result.success) {
                    workingProxies.push({
                        ...batch[index],
                        score: this.calculateProxyScore(result.responseTime),
                        lastChecked: new Date()
                    });
                }
            });

            await new Promise(resolve => setTimeout(resolve, this.delayBetweenChecks));
        }

        this.proxyList = workingProxies.sort((a, b) => b.score - a.score);
        this.usedProxies.clear();
        Logger.info(`Updated proxy list. Working proxies: ${this.proxyList.length}`);
    }

    getProxy() {
        if (this.proxyList.length === 0) {
            throw new Error("Proxy list is empty. Make sure to initialize ProxyManager first.");
        }
        const availableProxies = this.proxyList.filter(proxy => !this.usedProxies.has(proxy.proxy));
        if (availableProxies.length === 0) {
            this.usedProxies.clear();
            return this.proxyList[0];
        }
        const proxy = availableProxies.reduce((best, current) => 
            current.score > best.score ? current : best
        );
        this.usedProxies.add(proxy.proxy);
        return proxy;
    }

    async initialize() {
        if (!this.initializationPromise) {
            this.initializationPromise = (async () => {
                Logger.info('Initializing proxy manager...');
                await this.refreshProxyList();
                Logger.info('Proxy manager initialized successfully');
            })();
        }
        return this.initializationPromise;
    }

    isInitialized() {
        return this.initializationPromise !== null && this.proxyList.length > 0;
    }
}

module.exports = new ProxyManager();