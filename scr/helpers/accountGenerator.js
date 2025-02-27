const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const Logger = require('./logger');
const fs = require('fs').promises;
const { HttpsProxyAgent } = require('https-proxy-agent');

class AccountGenerator {
    constructor(accountCount) {
        this.accountCount = accountCount;
        this.cookiesFile = 'poe_cookies.json';
        this.domainFile = 'domain_results.json';
        this.smsnatorCookieJar = new tough.CookieJar();
        this.poeCookieJar = new tough.CookieJar();
        this.proxyConfig = {
            protocol: 'socks5',
            host: '',
            port: 80,
            auth: {
                username: '',
                password: ''
            }
        };
        this.smsnatorAxios = wrapper(axios.create({ 
            jar: this.smsnatorCookieJar,
            withCredentials: true,
            timeout: 10000,
            baseURL: 'https://smsnator.online'
        }));
        this.headers = {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br, zstd',
            'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
            'Content-Type': 'application/json',
            'Origin': 'https://smsnator.online',
            'Referer': 'https://smsnator.online/',
            'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
            'Sec-Ch-Ua-Mobile': '?0',
            'Sec-Ch-Ua-Platform': '"Windows"',
            'Sec-Fetch-Dest': 'empty',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Site': 'same-origin',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
            'X-Requested-With': 'XMLHttpRequest'
        };
        this.csrfToken = null;
        this.knownElements = [
            '#login',
            '#refreshbut > button > i',
            '#__next > div > main > div.LoggedOutSection_main__qRdCR > div > div.MainSignupLoginSection_inputAndMetaTextGroup__LqKA8 > form > div > input',
            '#__next > div > main > div.LoggedOutSection_main__qRdCR > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0',
            '#__next > div > main > div > div > div.SignupOrLoginWithCodeSection_inputAndMetaTextGroup__JNjDQ > form > input',
            'input[placeholder="Phone number"]',
            '#__next > div > main > div > div > button',
            'body > div:nth-child(31) > div > div > article > div > div.WebSubscriptionAnnouncement_title__K2wg5',
            '#__next > div > div.AnnouncementWrapper_container__Z51yh > div > main > div > div > div > div:nth-child(1) > div > a > img.PoeLogo_darkLogo__4KLOp',
            '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_',
            '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(1) > select',
            '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(2) > select',
            '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(3) > select',
            '#root > div > main > div.homepage--top > div > div > div > div.mb-3.card > h5',
            '#__next > div > main > div > div > button'
        ];
        this.accountCount = accountCount;
        this.currentProxy = null;
    }

    async initialize() {
        try {
            const { connect } = await import('puppeteer-real-browser');
            
            const proxyUrl = this.getProxyUrl();
            Logger.info(`Initializing with proxy: ${proxyUrl}`);

            const response = await connect({
                headless: false,
                turnstile: true,
                args: [
                    `--proxy-server=${this.proxyConfig.host}:${this.proxyConfig.port}`,
                    '--ignore-certificate-errors',
                    '--ignore-certificate-errors-spki-list'
                ]
            });
            
            const { page, browser, setTarget } = response;
            this.browser = browser;
            this.setTarget = setTarget;
            this.yopmailPage = page;

            await this.setProxyAuthentication(this.yopmailPage);

            this.setTarget({ status: false });
            this.poePage = await this.browser.newPage();
            this.smsnatorPage = await this.browser.newPage();
            this.setTarget({ status: true });

            await this.setProxyAuthentication(this.poePage);
            await this.setProxyAuthentication(this.smsnatorPage);

            await this.testProxyConnection();

            await this.initializeSession();
        } catch (error) {
            Logger.error(`Error initializing: ${error.message}`);
            throw error;
        }
    }

    async setProxyAuthentication(page) {
        await page.authenticate({
            username: this.proxyConfig.auth.username,
            password: this.proxyConfig.auth.password
        });
    }

    async testProxyConnection() {
        try {
            const response = await axios.get('https://api.ipify.org?format=json', {
                httpsAgent: new HttpsProxyAgent(this.getProxyUrl()),
                timeout: 5000
            });
            Logger.info(`Proxy connection successful. IP: ${response.data.ip}`);
        } catch (error) {
            Logger.error(`Proxy connection test failed: ${error.message}`);
            throw new Error('Proxy connection test failed');
        }
    }

    async initializeSession() {
        try {
            await this.smsnatorPage.setDefaultNavigationTimeout(this.navigationTimeout);
            const response = await this.smsnatorPage.goto('https://smsnator.online', { 
                waitUntil: 'networkidle0',
                timeout: this.navigationTimeout
            });
            
            if (!response || !response.ok()) {
                throw new Error(`Failed to load smsnator.online: ${response ? response.status() : 'No response'}`);
            }
            
            Logger.info('Successfully loaded smsnator.online');
            await this.updateSmsnatorCookiesAndToken();
    
            await this.smsnatorPage.evaluate(() => {
                setTimeout(() => {
                    if (window.chrome && window.chrome.debugger) {
                        window.chrome.debugger.attach({tabId: 1}, '1.3', () => {
                            console.log('DevTools opened');
                        });
                    }
                }, 5000);
            });
    
            Logger.info('Opened developer console after 5 seconds');
        } catch (error) {
            Logger.error(`Error initializing session: ${error.message}`);
        }
    }

    getProxyUrl() {
        const { protocol, host, port, auth } = this.proxyConfig;
        return `${protocol}://${auth.username}:${auth.password}@${host}:${port}`;
    }

    async updateSmsnatorCookiesAndToken() {
        try {
            const cookies = await this.smsnatorPage.cookies();
            
            cookies.forEach(cookie => {
                this.smsnatorCookieJar.setCookieSync(
                    tough.Cookie.fromJSON(JSON.stringify(cookie)),
                    'https://smsnator.online'
                );
            });

            const xsrfCookie = cookies.find(cookie => cookie.name === 'XSRF-TOKEN');
            this.csrfToken = xsrfCookie ? decodeURIComponent(xsrfCookie.value) : null;

            this.smsnatorAxios.defaults.headers.common['X-XSRF-TOKEN'] = this.csrfToken;
            Logger.info(`Updated XSRF-TOKEN: ${this.csrfToken}`);
        } catch (error) {
            Logger.error(`Error updating cookies and token: ${error.message}`);
            throw error;
        }
    }

    async navigateToPage(page, url) {
        try {
            await page.goto(url, { waitUntil: 'domcontentloaded' });
            await page.bringToFront();
        } catch (error) {
            Logger.error(`Error navigating to ${url}: ${error.message}`);
            throw error;
        }
    }

    async getRandomEmail() {
        try {
            const data = await fs.readFile(this.domainFile, 'utf8');
            const { workingDomains } = JSON.parse(data);
            if (workingDomains.length === 0) throw new Error("No working domains available");
            const randomDomain = workingDomains[Math.floor(Math.random() * workingDomains.length)];
            const randomString = Math.random().toString(36).substring(7);
            return `${randomString}${randomDomain}`;
        } catch (error) {
            Logger.error(`Error getting random email: ${error.message}`);
            throw error;
        }
    }

    async getEmailVerificationCode() {
        for (let i = 0; i < 15; i++) {
            try {
                await this.yopmailPage.waitForSelector('#refresh', { visible: true, timeout: 10000 });
                await this.yopmailPage.click('#refresh');
                await this.yopmailPage.waitForTimeout(5000);

                const frame = await this.yopmailPage.frames().find(frame => frame.name() === 'ifmail');
                if (frame) {
                    const code = await frame.$eval('div[style*="font-size: 19px"][style*="font-weight: 700"]', el => el.textContent.trim());
                    if (code) {
                        Logger.info(`Found verification code: ${code}`);
                        return code;
                    }
                }

                Logger.info("Code not found, retrying...");
            } catch (error) {
                Logger.error(`Error getting email verification code: ${error.message}`);
            }
        }
        throw new Error("Email verification code not found after multiple attempts");
    }

    async makeSmsnatorRequest(method, url, data = null) {
        try {
            await this.updateSmsnatorCookiesAndToken();
            const response = await this.smsnatorAxios({
                method,
                url,
                data,
                headers: {
                    ...this.headers,
                    'X-XSRF-TOKEN': this.csrfToken,
                    'Cookie': await this.getCookieString(this.smsnatorPage)
                }
            });
            return response.data;
        } catch (error) {
            Logger.error(`Smsnator request failed: ${error.message}`);
            throw error;
        }
    }

    async getPhoneNumber() {
        try {
            const response = await this.makeSmsnatorRequest('post', '/generate-number', { number: ["SE", "FI"] });
            return response.number;
        } catch (error) {
            Logger.error(`Error getting phone number: ${error.message}`);
            throw error;
        }
    }

    async getSmsVerificationCode(phoneNumber) {
        for (let i = 0; i < 10; i++) {
            try {
                const response = await this.makeSmsnatorRequest('post', '/message-list', { number: phoneNumber });
    
                if (response && Array.isArray(response)) {
                    const quoraMessage = response.find(msg => msg.from === "QUORA");
                    if (quoraMessage) {
                        const match = quoraMessage.message.match(/Your Poe verification code is: (\d+)/);
                        if (match) return match[1];
                    }
                } else {
                    Logger.warn("Unexpected response format from message-list endpoint");
                }
                
                Logger.info("SMS code not found, retrying...");
                await new Promise(resolve => setTimeout(resolve, 3000));
            } catch (error) {
                Logger.error(`Error getting SMS code: ${error.message}`);
            }
        }
        throw new Error("SMS verification code not received after maximum attempts");
    }

    async safeClick(page, selector) {
        try {
            await page.waitForSelector(selector, { visible: true, timeout: 10000 });
            await page.evaluate((sel) => {
                const element = document.querySelector(sel);
                if (element) element.click();
            }, selector);
            Logger.info(`Clicked on selector: ${selector}`);
        } catch (error) {
            Logger.error(`Error clicking on selector ${selector}: ${error.message}`);
            throw error;
        }
    }

    async waitForKnownElement(page, timeout = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            for (const selector of this.knownElements) {
                if (await page.$(selector)) {
                    Logger.info(`Found known element: ${selector}`);
                    return selector;
                }
            }
            await page.waitForTimeout(1000);
        }
        Logger.error('No known element found within timeout');
        throw new Error('No known element found within timeout');
    }
    
    async setProxyAuth(page) {
        await page.authenticate({
            username: this.proxyConfig.auth.username,
            password: this.proxyConfig.auth.password
        });
    }

    async changeProxy() {
        const proxies = proxyManager.getProxies();
        if (proxies.length > 0) {
            this.currentProxy = proxies[Math.floor(Math.random() * proxies.length)];
            Logger.info(`Changed proxy to: ${this.currentProxy.ip}:${this.currentProxy.port}`);
            
            await this.setProxyAuth(this.poePage);
            await this.setProxyAuth(this.smsnatorPage);
            await this.setProxyAuth(this.yopmailPage);
        } else {
            Logger.warn('No proxies available');
            this.currentProxy = null;
        }
    }

    async checkForError(page, errorText) {
        try {
            const errorTextContent = await page.evaluate(() => {
                const elements = document.querySelectorAll('*');
                for (const element of elements) {
                    if (element.textContent.includes('Too many attempts. Please wait and try again later.')) {
                        return element.textContent;
                    }
                }
                return null;
            });
    
            if (errorTextContent) {
                if (errorText && !errorTextContent.includes(errorText)) {
                    return false;
                }
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }
    
    async checkForPhoneError(page, errorText) {
        try {
            const errorTextContent = await page.evaluate(() => {
                const elements = document.querySelectorAll('*');
                for (const element of elements) {
                    if (element.textContent.includes('Verification with this phone number has been temporarily blocked. Please use email instead.')) {
                        return element.textContent;
                    }
                }
                return null;
            });
    
            if (errorTextContent) {
                if (errorText && !errorTextContent.includes(errorText)) {
                    return false;
                }
                return true;
            }
            return false;
        } catch (error) {
            return false;
        }
    }

    async generateAccount() {
        let email, phoneNumber;
        const maxAttempts = 3;
    
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                Logger.info(`Attempt ${attempt} of ${maxAttempts} to generate account`);
    
                email = await this.createEmail();
                Logger.info(`Email created: ${email}`);

                await this.registerOnPoe(email);
                Logger.info('Registered on Poe');

                await this.confirmEmail();
                Logger.info('Email confirmed');

                phoneNumber = await this.enterPhoneNumber();
                Logger.info(`Phone number entered: ${phoneNumber}`);

                await this.confirmPhoneNumber(phoneNumber);
                Logger.info('Phone number confirmed');

                await this.fillAdditionalInfo();
                Logger.info('Additional info filled');
    
                Logger.info(`Successfully created account with email: ${email} and phone: ${phoneNumber}`);
    
                await this.poePage.goto('https://poe.com');
                await this.poePage.waitForTimeout(7000);
    
                const cookies = await this.poePage.cookies();
                const requiredCookies = cookies.filter(cookie => ['p-b', 'p-lat'].includes(cookie.name));
            
                let existingData = [];
                try {
                    const fileContent = await fs.readFile('poe_cookies.json', 'utf8');
                    existingData = JSON.parse(fileContent);
                } catch (error) {
                    Logger.info('No existing cookie file found or error reading it. Creating new file.');
                }
            
                const updatedData = [...existingData, ...requiredCookies];
            
                await fs.writeFile('poe_cookies.json', JSON.stringify(updatedData, null, 2));
            
                Logger.info('Added new p-b and p-lat cookies to poe_cookies.json');
    
                return { success: true, email, phoneNumber };
    
            } catch (error) {
                Logger.error(`Error during account generation (Attempt ${attempt}): ${error.message}`);
                Logger.error(`Stack trace: ${error.stack}`);

                const screenshot = await this.poePage.screenshot({ fullPage: true });
                await fs.writeFile(`error_screenshot_${Date.now()}.png`, screenshot);
                Logger.info(`Saved error screenshot`);

                const html = await this.poePage.content();
                await fs.writeFile(`error_html_${Date.now()}.html`, html);
                Logger.info(`Saved error HTML`);

                if (await this.checkForGeneralError()) {
                    Logger.info('General error detected. Restarting browser...');
                    await this.closeBrowser();
                    await this.initialize();
                } else if (await this.checkForPhoneError()) {
                    Logger.info('Phone number error detected. Changing phone number...');
                    phoneNumber = await this.getPhoneNumber();
                    await this.enterPhoneNumber(phoneNumber);
                } else if (attempt === maxAttempts) {
                    Logger.error('Max attempts reached. Failing account generation.');
                    return { success: false, email: null, phoneNumber: null, error: error.message };
                }
            }
        }
    }

    async checkForGeneralError() {
        return this.checkForErrorWithText(
            'Too many attempts. Please wait and try again later.'
        );
    }
    
    async checkForPhoneError() {
        return this.checkForErrorWithText(
            'Verification with this phone number has been temporarily blocked. Please use email instead.'
        );
    }
    
    async checkForErrorWithText(errorText) {
        try {
            const errorTextContent = await this.poePage.evaluate((text) => {
                const elements = document.querySelectorAll('*');
                for (const element of elements) {
                    if (element.textContent.includes(text)) {
                        return element.textContent;
                    }
                }
                return null;
            }, errorText);
    
            return !!errorTextContent;
        } catch (error) {
            return false;
        }
    }
    
    async createEmail() {
        Logger.info("Creating email...");
        await this.yopmailPage.bringToFront();
        await this.navigateToPage(this.yopmailPage, 'https://yopmail.com/');
        const email = await this.getRandomEmail();
        await this.waitForKnownElement(this.yopmailPage);
        await this.yopmailPage.type('#login', email);
        await this.safeClick(this.yopmailPage, '#refreshbut > button > i');
        return email;
    }
    
    async registerOnPoe(email) {
        Logger.info("Registering on Poe...");
        await this.poePage.bringToFront();
        await this.navigateToPage(this.poePage, 'https://poe.com');
        await this.waitForKnownElement(this.poePage);
        await this.poePage.type('#__next > div > main > div.LoggedOutSection_main__qRdCR > div > div.MainSignupLoginSection_inputAndMetaTextGroup__LqKA8 > form > div > input', email);
        await this.safeClick(this.poePage, '#__next > div > main > div.LoggedOutSection_main__qRdCR > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');
        if (await this.checkForError(this.poePage)) {
            throw new Error('Registration error on Poe');
        }
    }
    
    async confirmEmail() {
        Logger.info("Confirming email...");
        await this.yopmailPage.bringToFront();
        const emailCode = await this.getEmailVerificationCode();
        await this.poePage.bringToFront();
        await this.waitForKnownElement(this.poePage);
        await this.poePage.type('#__next > div > main > div > div > div.SignupOrLoginWithCodeSection_inputAndMetaTextGroup__JNjDQ > form > input', emailCode);
        await this.safeClick(this.poePage, '#__next > div > main > div > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');
        if (await this.checkForError(this.poePage)) {
            throw new Error('Email confirmation error');
        }
    }

    async enterPhoneNumber(phoneNumber = null) {
        await this.poePage.bringToFront();
        Logger.info("Entering phone number...");
        const maxPhoneAttempts = 5;
        for (let i = 0; i < maxPhoneAttempts; i++) {
            if (!phoneNumber) {
                phoneNumber = await this.getPhoneNumber();
            }
            await this.poePage.evaluate(() => {
                document.querySelector('input[placeholder="Phone number"]').value = '';
            });
            await this.poePage.type('input[placeholder="Phone number"]', phoneNumber);
            await this.safeClick(this.poePage, '#__next > div > main > div > div > button');
            await this.poePage.waitForTimeout(3000);
            
            const hasGeneralError = await this.checkForGeneralError();
            const hasPhoneError = await this.checkForPhoneError();
            
            if (!hasGeneralError && !hasPhoneError) {
                return phoneNumber;
            }
            if (hasGeneralError) {
                throw new Error('General error detected');
            }
            Logger.warn("Phone number not accepted. Trying another one...");
            phoneNumber = null;
        }
        throw new Error('Failed to find a valid phone number after maximum attempts');
    }
    
    async confirmPhoneNumber(phoneNumber) {
        Logger.info("Confirming phone number...");
        await this.poePage.bringToFront();
        const smsCode = await this.getSmsVerificationCode(phoneNumber);
        await this.poePage.type('#__next > div > main > div > div > div.SignupOrLoginWithCodeSection_inputAndMetaTextGroup__JNjDQ > form > input', smsCode);
        await this.safeClick(this.poePage, '#__next > div > main > div > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');
        if (await this.checkForError(this.poePage)) {
            throw new Error('Phone confirmation error');
        }
    }
    
    async fillAdditionalInfo() {
        Logger.info("Filling additional info if required...");
        
        try {
            const result = await Promise.race([
                this.poePage.waitForSelector('#__next > div > main > div > div > div.SignupWithBirthdaySection_titleWrapper__oRGHc', { timeout: 10000 }),
                this.poePage.waitForNavigation({ timeout: 10000 })
            ]);
    
            if (result && result.constructor.name === 'ElementHandle') {
                Logger.info("Birthday input detected. Handling birthday...");
                await this.handleBirthdayInput(this.poePage);
            } else {
                Logger.info("No birthday input detected. Skipping birthday handling.");
            }
        } catch (error) {
            Logger.warn(`Error while checking for additional info: ${error.message}`);
            Logger.info("Proceeding without handling birthday input.");
        }
    
        Logger.info("Additional info filled");
    }
    
    async handleBirthdayInput(page) {
        Logger.info("Handling birthday input...");
    
        const monthSelector = '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(1) > select';
        const daySelector = '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(2) > select';
        const yearSelector = '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_ > form > div:nth-child(3) > select';
        const confirmButtonSelector = '#__next > div > main > div > div > button';
    
        try {
            await page.waitForSelector(monthSelector, { visible: true, timeout: 5000 });
    
            await page.select(monthSelector, await this.selectRandomOption(page, monthSelector));
            Logger.info("Month selected");
            await page.waitForTimeout(500);
    
            await page.select(daySelector, await this.selectRandomOption(page, daySelector));
            Logger.info("Day selected");
            await page.waitForTimeout(500);
    
            const years = await page.$$eval(`${yearSelector} option`, options => 
                options.filter(option => !option.disabled).map(option => option.value)
            );
            const validYears = years.filter(year => year >= 1970 && year <= 2005);
            const randomYear = validYears[Math.floor(Math.random() * validYears.length)];
            await page.select(yearSelector, randomYear);
            Logger.info(`Year selected: ${randomYear}`);
            await page.waitForTimeout(500);
    
            await this.safeClick(page, confirmButtonSelector);
            Logger.info("Clicked confirm button");
    
            await page.waitForNavigation({ waitUntil: 'networkidle0', timeout: 10000 });
            Logger.info("Navigation after birthday input completed");
        } catch (error) {
            Logger.error(`Error in handleBirthdayInput: ${error.message}`);
            throw error;
        }
    }
    
    async selectRandomOption(page, selector) {
        const options = await page.$$eval(`${selector} option`, options => 
            options.filter(option => !option.disabled && option.value !== "").map(option => option.value)
        );
        return options[Math.floor(Math.random() * options.length)];
    }
    

    async closeBrowser() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
            this.yopmailPage = null;
            this.poePage = null;
            this.smsnatorPage = null;
        }
    }

    async run() {
        try {
            for (let i = 0; i < this.accountCount; i++) {
                Logger.info(`Initializing for account ${i + 1} of ${this.accountCount}`);
                await this.initialize();
                
                Logger.info(`Generating account ${i + 1} of ${this.accountCount}`);
                const result = await this.generateAccount();
                
                if (result.success) {
                    Logger.info(`Account created successfully. Email: ${result.email}, Phone: ${result.phoneNumber}`);
                } else {
                    Logger.error(`Failed to create account. Error: ${result.error}`);
                }
                
                Logger.info(`Closing browser for account ${i + 1}`);
                await this.closeBrowser();
                
                const delay = 2000;
                Logger.info(`Waiting for ${delay / 1000} seconds before next account creation...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        } catch (error) {
            Logger.error(`Unhandled error in account generation: ${error.message}`);
        } finally {
            await this.closeBrowser();
        }
    }

    async getCookieString(page) {
        const cookies = await page.cookies();
        return cookies.map(cookie => `${cookie.name}=${cookie.value}`).join('; ');
    }
}

async function main() {
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });

    readline.question('How many accounts do you want to create? ', async (count) => {
        readline.close();
        const accountCount = parseInt(count, 10);
        if (isNaN(accountCount) || accountCount <= 0) {
            console.log('Please enter a valid positive number.');
            return;
        }
        const generator = new AccountGenerator(accountCount);
        await generator.run();
    });
}

main().catch(error => Logger.error(`Critical error: ${error.message}`));