const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Logger = require('../helpers/logger');
puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor(options = {}) {
    this.options = {
      headless: true,
      url: 'https://pi.ai/talk',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init() {
    if (!this.browser) {
      this.browser = await puppeteer.launch({ headless: this.options.headless });
      this.page = await this.browser.newPage();
      await this.page.goto(this.options.url, { waitUntil: 'networkidle0' });
      
      await this.handleCloudflareChallenge();
      
      Logger.info('Browser session initialized');
    }
  }

  async handleCloudflareChallenge() {
    try {
      await this.page.waitForFunction(() => {
        return !document.querySelector('div.cf-browser-verification');
      }, { timeout: 30000 });
    } catch (error) {
      Logger.error('Cloudflare challenge not solved in time:', error);
    }
  }

  async evaluate(pageFunction, ...args) {
    await this.init();
    return this.page.evaluate(pageFunction, ...args);
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}

module.exports = BrowserManager;