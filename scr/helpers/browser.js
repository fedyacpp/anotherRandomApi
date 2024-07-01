const Logger = require('../helpers/logger');

class BrowserManager {
  constructor(options = {}) {
    this.options = {
      headless: 'auto',
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
    try {
      const { connect } = await import('puppeteer-real-browser');
      const response = await connect({
        headless: this.options.headless,
        turnstile: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        customConfig: {},
      });
      
      this.browser = response.browser;
      this.page = response.page;

      Logger.info(`Navigating to ${this.options.url}`);
      
      this.page.on('console', msg => Logger.info(`Browser Console: ${msg.text()}`));

      await this.page.goto(this.options.url, { waitUntil: 'networkidle0', timeout: 60000 });
      
      Logger.info('Browser session initialized');
    } catch (error) {
      Logger.error('Error initializing browser:', error);
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

  async setUserAgent(userAgent) {
    await this.init();
    await this.page.setUserAgent(userAgent);
    Logger.info(`User agent set to: ${userAgent}`);
  }
}

module.exports = BrowserManager;