const axios = require('axios');
const tough = require('tough-cookie');
const { wrapper } = require('axios-cookiejar-support');
const Logger = require('./logger');
const fs = require('fs').promises;

class AccountGenerator {
    constructor(accountCount) {
        this.accountCount = accountCount;
        this.cookiesFile = 'poe_cookies.json';
        this.domainFile = 'domain_results.json';
        this.smsnatorCookieJar = new tough.CookieJar();
        this.poeCookieJar = new tough.CookieJar();
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
            '#__next > div > main > div > div > button'
        ];
    }   

    async initialize() {
        try {
            const { connect } = await import('puppeteer-real-browser');
            const response = await connect({
                headless: false,
                turnstile: true
            });
            
            const { page, browser, setTarget } = response;
            this.browser = browser;
            this.setTarget = setTarget;
            this.yopmailPage = page;

            this.setTarget({ status: false });
            this.poePage = await this.browser.newPage();
            this.smsnatorPage = await this.browser.newPage();
            this.setTarget({ status: true });

            await this.initializeSession();
        } catch (error) {
            Logger.error(`Error initializing: ${error.message}`);
            throw error;
        }
    }

    async initializeSession() {
        try {
            await this.smsnatorPage.goto('https://smsnator.online');
            await this.updateSmsnatorCookiesAndToken();
        } catch (error) {
            Logger.error(`Error initializing session: ${error.message}`);
            throw error;
        }
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
        await page.waitForSelector(selector, { visible: true, timeout: 10000 });
        await page.evaluate((sel) => {
            const element = document.querySelector(sel);
            if (element) element.click();
        }, selector);
    }

    async waitForKnownElement(page, timeout = 30000) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            for (const selector of this.knownElements) {
                if (await page.$(selector)) {
                    return selector;
                }
            }
            await page.waitForTimeout(1000);
        }
        throw new Error('No known element found within timeout');
    }

    async generateAccount() {
        try {
            Logger.info("Navigating to Yopmail...");
            await this.navigateToPage(this.yopmailPage, 'https://yopmail.com/');

            const email = await this.getRandomEmail();
            await this.waitForKnownElement(this.yopmailPage);
            await this.yopmailPage.type('#login', email);
            await this.safeClick(this.yopmailPage, '#refreshbut > button > i');

            Logger.info("Navigating to Poe...");
            await this.navigateToPage(this.poePage, 'https://poe.com');
            
            Logger.info("Entering email on Poe...");
            await this.waitForKnownElement(this.poePage);
            await this.poePage.type('#__next > div > main > div.LoggedOutSection_main__qRdCR > div > div.MainSignupLoginSection_inputAndMetaTextGroup__LqKA8 > form > div > input', email);
            await this.safeClick(this.poePage, '#__next > div > main > div.LoggedOutSection_main__qRdCR > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');

            Logger.info("Switching back to Yopmail to get verification code...");
            await this.yopmailPage.bringToFront();
            
            Logger.info("Getting email verification code...");
            const emailCode = await this.getEmailVerificationCode();
            
            Logger.info("Switching back to Poe to enter verification code...");
            await this.poePage.bringToFront();
            
            Logger.info("Entering email verification code on Poe...");
            await this.waitForKnownElement(this.poePage);
            await this.poePage.type('#__next > div > main > div > div > div.SignupOrLoginWithCodeSection_inputAndMetaTextGroup__JNjDQ > form > input', emailCode);
            await this.safeClick(this.poePage, '#__next > div > main > div > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');

            Logger.info("Waiting for phone number input...");
            await this.waitForKnownElement(this.poePage);

            Logger.info("Getting phone number...");
            const phoneNumber = await this.getPhoneNumber();
            Logger.info(`Got phone number: ${phoneNumber}`);
            
            Logger.info("Entering phone number on Poe...");
            await this.poePage.type('input[placeholder="Phone number"]', phoneNumber);
            
            Logger.info("Clicking 'Send code' button...");
            await this.safeClick(this.poePage, '#__next > div > main > div > div > button');

            Logger.info("Waiting for SMS verification code input...");
            await this.waitForKnownElement(this.poePage);
    
            Logger.info("Getting SMS verification code...");
            const smsCode = await this.getSmsVerificationCode(phoneNumber);
            Logger.info(`Got SMS verification code: ${smsCode}`);
            
            Logger.info("Entering SMS verification code on Poe...");
            await this.poePage.type('#__next > div > main > div > div > div.SignupOrLoginWithCodeSection_inputAndMetaTextGroup__JNjDQ > form > input', smsCode);
    
            Logger.info("Clicking 'Verify' button...");
            await this.safeClick(this.poePage, '#__next > div > main > div > div > button.Button_buttonBase__Bv9Vx.Button_primary__6UIn0');
    
            const birthdaySelector = '#__next > div > main > div > div > div.SignupWithBirthdaySection_selectAndMetaTextGroup__5T4M_';
            const hasBirthdayInput = await this.poePage.$(birthdaySelector) !== null;

            if (hasBirthdayInput) {
                await this.handleBirthdayInput(this.poePage);
            }

            Logger.info("Waiting for login confirmation...");
            let isLoggedIn = false;
            try {
                await new Promise(resolve => setTimeout(resolve, 3000));
                await this.waitForKnownElement(this.poePage);
                isLoggedIn = true;
                Logger.info("Login confirmation element found.");
            } catch (error) {
                Logger.warn("Login confirmation element not found within timeout.");
            }
    
            if (isLoggedIn) {
                Logger.info(`Successfully created account with email: ${email} and phone: ${phoneNumber}`);
                const cookies = await this.poePage.cookies();
                const pbCookie = cookies.find(cookie => cookie.name === 'p-b');
                const pLatCookie = cookies.find(cookie => cookie.name === 'p-lat');
                if (pbCookie && pLatCookie) {
                    await fs.writeFile(this.cookiesFile, JSON.stringify({ email, phoneNumber, pbCookie: pbCookie.value, pLatCookie: pLatCookie.value }, null, 2));
                    Logger.info(`Saved p-b and p-lat cookies to ${this.cookiesFile}`);
                } else {
                    Logger.warn("p-b or p-lat cookie not found");
                }
                return { success: true, email, phoneNumber };
            } else {
                Logger.info(`Failed to create account with email: ${email} and phone: ${phoneNumber}`);
                return { success: false, email, phoneNumber };
            }
    
        } catch (error) {
            Logger.error(`Error creating account: ${error.message}`);
            return { success: false, email: null, phoneNumber: null, error: error.message };
        }
    }

    async run() {
        try {
            await this.initialize();
            for (let i = 0; i < this.accountCount; i++) {
                Logger.info(`Generating account ${i + 1} of ${this.accountCount}`);
                const result = await this.generateAccount();
                if (result.success) {
                    Logger.info(`Account created successfully. Email: ${result.email}, Phone: ${result.phoneNumber}`);
                } else {
                    Logger.error(`Failed to create account. Error: ${result.error}`);
                }
            }
        } catch (error) {
            Logger.error(`Unhandled error in account generation: ${error.message}`);
        } finally {
            if (this.browser) {
                await this.browser.close();
            }
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