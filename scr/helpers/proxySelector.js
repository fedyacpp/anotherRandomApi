const fs = require('fs').promises;
const path = require('path');
const Logger = require('./logger');

class ProxySelector {
    constructor() {
        this.proxyList = [];
        this.lastUsedIndex = -1;
        this.isLoaded = false;
    }

    async init() {
        await this.loadProxies();
        this.isLoaded = true;
    }

    async loadProxies() {
        try {
            const filePath = path.join(__dirname, '..', '..', 'proxyList.json');
            const data = await fs.readFile(filePath, 'utf8');
            const jsonData = JSON.parse(data);
            
            if (jsonData.proxies && Array.isArray(jsonData.proxies)) {
                this.proxyList = jsonData.proxies.filter(proxy => this.isValidProxy(proxy));
                Logger.log(`Proxies loaded successfully. Total valid proxies: ${this.proxyList.length}`);
            } else {
                Logger.error('Invalid proxy data in proxyList.json');
            }
        } catch (error) {
            Logger.error('Error loading proxies:', error);
        }
    }

    isValidProxy(proxy) {
        if (!proxy || typeof proxy !== 'object') {
            Logger.warn('Invalid proxy object');
            return false;
        }
        if (!proxy.host || !proxy.port) {
            Logger.warn('Proxy missing host or port');
            return false;
        }
        if (!proxy.auth || !proxy.auth.username || !proxy.auth.password) {
            Logger.warn('Proxy missing auth credentials');
            return false;
        }
        return true;
    }

    async getNextProxy() {
        if (!this.isLoaded) {
            await this.init();
        }

        if (this.proxyList.length === 0) {
            Logger.warn('No valid proxies available');
            return null;
        }
        this.lastUsedIndex = (this.lastUsedIndex + 1) % this.proxyList.length;
        const proxy = this.proxyList[this.lastUsedIndex];
        Logger.log(`Using proxy: ${proxy.host}:${proxy.port}`);
        return proxy;
    }
}

module.exports = new ProxySelector();