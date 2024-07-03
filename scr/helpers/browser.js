const Logger = require('../helpers/logger');

class BrowserManager {
  constructor(options = {}) {
    this.options = {
      headless: 'auto',
      url: 'https://pi.ai',
      waitForSelector: 'body',
      timeout: 60000,
      ...options
    };
    this.browser = null;
    this.page = null;
    this.cookies = null;
    this.capturedRequests = [];
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

      this.page.on('error', error => {
        Logger.error('Page error:', error);
      });

      this.page.on('pageerror', error => {
        Logger.error('Page error:', error);
      });
  
      await Promise.race([
        this.page.goto(this.options.url, { waitUntil: 'networkidle0' }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Navigation timeout')), this.options.timeout))
      ]);
  
      Logger.info('Page loaded, waiting for selector...');
  
      await this.page.waitForSelector(this.options.waitForSelector, { timeout: this.options.timeout });
      
      Logger.info(`Selector "${this.options.waitForSelector}" found`);
  
      await this.page.waitForTimeout(5000);

      this.cookies = await this.page.cookies();
      if (this.cookies.length === 0) {
        Logger.warn('No cookies found with page.cookies(), trying CDP...');
        const client = await this.page.target().createCDPSession();
        const cdpCookies = await client.send('Network.getAllCookies');
        this.cookies = cdpCookies.cookies;
      }

      Logger.info(`Cookies loaded: ${this.cookies.length}`);
  
      if (this.cookies.length === 0) {
        Logger.warn('No cookies were loaded');
      } else {
        Logger.info('Cookies:', this.cookies);
      }
  
      Logger.info('Browser session initialized successfully');
    } catch (error) {
      Logger.error('Error initializing browser:', error);
      throw error;
    }
  }

  async getCookies() {
    if (!this.cookies) {
      await this.init();
    }
    return this.cookies;
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
      this.cookies = null;
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