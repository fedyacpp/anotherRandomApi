const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Logger = require('../helpers/logger');

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor(options = {}) {
    this.options = {
      headless: false,
      url: 'https://pi.ai',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init() {
    if (this.browser && this.page) {
      return;
    }

    Logger.info('Initializing BrowserManager...');
    this.browser = await puppeteer.launch({
      headless: this.options.headless,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    this.page = await this.browser.newPage();
    Logger.info(`Navigating to ${this.options.url}`);
    await this.page.goto(this.options.url, { waitUntil: 'networkidle0', timeout: 60000 });
    await this.handleCloudflareChallenge();

    Logger.info('Browser session initialized');
  }

  async handleCloudflareChallenge() {
    try {
      await this.page.waitForFunction(() => {
        return !document.querySelector('div.cf-browser-verification');
      }, { timeout: 30000 });
    } catch (error) {
      Logger.error('Cloudflare challenge not solved in time:', error);
      throw error;
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

  async reset() {
    await this.close();
    await this.init();
    Logger.info('Browser session reset');
  }
}

module.exports = BrowserManager;