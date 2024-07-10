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
    }

    async fetchProxies() {
        try {
            const response = await axios.get(this.proxyUrl);
            return response.data.split('\n')
                .filter(line => line.trim())
                .slice(0, this.maxProxiesToFetch)
                .map(line => {
                    const [ip, port] = line.split(':');
                    return { ip, port: parseInt(port) };
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
            return { ...proxy, responseTime };
        } catch (error) {
            return null;
        }
    }

    async getProxy() {
        const rawProxies = await this.fetchProxies();
        Logger.info(`Fetched ${rawProxies.length} proxies. Testing...`);

        const testedProxies = await Promise.all(
            rawProxies.map(proxy => this.testProxy(proxy))
        );

        const workingProxies = testedProxies
            .filter(proxy => proxy !== null)
            .sort((a, b) => a.responseTime - b.responseTime)
            .slice(0, this.maxProxiesToKeep);

        Logger.info(`Found ${workingProxies.length} working proxies`);
        return workingProxies;
    }

    async initialize() {
        try {
            Logger.info('Initializing proxy manager...');
            this.proxyList = await this.getProxy();
            Logger.info('Proxy manager initialized successfully');

        } catch (error) {
            Logger.error(`Failed to initialize proxy manager: ${error.message}`);
            throw error;
        }
    }

    getProxies() {
        return this.proxyList;
    }

    isInitialized() {
        return this.proxyList.length > 0;
    }
}

module.exports = new ProxyManager();
