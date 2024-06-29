const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const Logger = require('../helpers/logger');

puppeteer.use(StealthPlugin());

class BrowserManager {
  constructor(options = {}) {
    this.options = {
      headless: false,
      url: 'https://liaobots.work',
      ...options
    };
    this.browser = null;
    this.page = null;
  }

  async init(proxySettings = null) {
    if (!this.browser) {
      const launchOptions = { 
        headless: this.options.headless,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      };
      if (proxySettings) {
        launchOptions.args.push(`--proxy-server=${proxySettings.protocol}://${proxySettings.host}:${proxySettings.port}`);
      }
      this.browser = await puppeteer.launch(launchOptions);
      this.page = await this.browser.newPage();
      if (proxySettings && proxySettings.username && proxySettings.password) {
        await this.page.authenticate({
          username: proxySettings.username,
          password: proxySettings.password
        });
      }
      await this.page.goto(this.options.url, { waitUntil: 'networkidle0', timeout: 60000 });
      
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

  async reset(proxySettings = null) {
    await this.close();
    await this.init(proxySettings);
    Logger.info('Browser session reset');
  }

  async setUserAgent(userAgent) {
    if (this.page) {
      await this.page.setUserAgent(userAgent);
      Logger.info(`User agent set to: ${userAgent}`);
    }
  }
}

module.exports = BrowserManager;