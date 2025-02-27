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
        args: [
          '--no-sandbox',
          '--disable-blink-features=AutomationControlled',
          '--disable-infobars',
          '--window-size=1920,1080',
        ],
        defaultViewport: null,
        ignoreHTTPSErrors: true,
      });
      
      this.browser = response.browser;
      this.page = response.page;
  
      Logger.info('Browser and page initialized successfully');

      this.page.on('console', msg => Logger.info(`Browser Console: ${msg.text()}`));
      this.page.on('error', error => Logger.error('Page error:', error));
      this.page.on('pageerror', error => Logger.error('Page error:', error));

      this.cookies = await this.getPageCookies(this.options.url);

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

  async logModalStructure() {
    try {
      const modalStructure = await this.page.evaluate(() => {
        const modal = document.querySelector('body > div.modal-mask');
        return modal ? modal.outerHTML : 'Modal not found';
      });
      Logger.info('Modal structure:', modalStructure);
    } catch (error) {
      Logger.error('Error logging modal structure:', error);
    }
  }
  
  async getPageCookies(url) {
    try {
      await this.init();
  
      if (!this.page) {
        throw new Error('Page is not initialized');
      }
  
      const currentUrl = await this.page.url();
      if (currentUrl !== url) {
        Logger.info(`Navigating to ${url}`);
        await this.page.goto(url, { waitUntil: 'networkidle2', timeout: this.options.timeout });
      }
      
      await this.page.waitForSelector('body', { visible: true, timeout: 10000 });
      
      const client = await this.page.target().createCDPSession();
      const {cookies} = await client.send('Network.getAllCookies');
      
      Logger.info(`Retrieved ${cookies.length} cookies`);
      
      if (cookies.length === 0) {
        Logger.warn('No cookies found');
      }
      
      return cookies;
    } catch (error) {
      await this.logModalStructure();
      Logger.error('Error in getPageCookies:', error);
      throw new Error('Failed to get page cookies: ' + error.message);
    }
  }
}

module.exports = BrowserManager;