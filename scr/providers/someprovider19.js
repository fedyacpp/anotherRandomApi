const WebSocket = require('ws');
const axios = require('axios');
const tough = require('tough-cookie');
const Logger = require('../helpers/logger');
const BrowserManager = require('../helpers/browser');
const ProviderInterface = require('./ProviderInterface');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class Provider19Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'Provider19Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class Provider19 extends ProviderInterface {
    constructor() {
        super();
        this.url = "https://labs.perplexity.ai";
        this.api_url = "https://www.perplexity.ai/socket.io/";
        this.ws_url = "wss://www.perplexity.ai/socket.io/";
        this.modelInfo = {
            modelId: "llama-3-sonar-large-32k-online",
            name: "llama-3-sonar-large-32k-online",
            description: "Perplexity's LLaMA 3 variant with real-time information access, enhancing its knowledge base",
            context_window: 32768,
            author: "Perplexity AI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: ""
        };
        this.cookieJar = new tough.CookieJar();
        this.axiosInstance = axios.create({
            withCredentials: true
        });
        this.conversationHistory = "";
        this.browserManager = new BrowserManager({
            url: 'https://labs.perplexity.ai'
        });
        this.rateLimiter = {
            tokens: 100,
            refillRate: 50,
            lastRefill: Date.now(),
            capacity: 500
        };
        this.maxRetries = 3;
        this.retryDelay = 1000;
    }

    getHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:121.0) Gecko/20100101 Firefox/121.0",
            "Accept": "*/*",
            "Accept-Language": "en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7",
            "Accept-Encoding": "gzip, deflate, br",
            "Origin": this.url,
            "Connection": "keep-alive",
            "Referer": `${this.url}/`,
            "Sec-Fetch-Dest": "empty",
            "Sec-Fetch-Mode": "cors",
            "Sec-Fetch-Site": "same-site",
            "TE": "trailers",
            "Cookie": this.cookieJar.getCookieStringSync(this.api_url)
        };
    }

    async waitForRateLimit() {
        const now = Date.now();
        const elapsedMs = now - this.rateLimiter.lastRefill;
        this.rateLimiter.tokens = Math.min(
            this.rateLimiter.capacity,
            this.rateLimiter.tokens + (elapsedMs * this.rateLimiter.refillRate) / 1000
        );
        this.rateLimiter.lastRefill = now;

        if (this.rateLimiter.tokens < 1) {
            const waitMs = (1 - this.rateLimiter.tokens) * (1000 / this.rateLimiter.refillRate);
            await sleep(waitMs);
            return this.waitForRateLimit();
        }

        this.rateLimiter.tokens -= 1;
    }

    async createSession() {
        await this.waitForRateLimit();
        try {
            const t = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
            const response = await this.axiosInstance.get(`${this.api_url}?EIO=4&transport=polling&t=${t}`, {
                headers: this.getHeaders()
            });

            if (response.status !== 200 || !response.data.startsWith("0")) {
                throw new Provider19Error("Invalid response format", "INVALID_RESPONSE");
            }

            const cookies = response.headers['set-cookie'];
            if (cookies) {
                cookies.forEach(cookie => {
                    this.cookieJar.setCookieSync(cookie, this.api_url);
                });
            }

            const sid = JSON.parse(response.data.slice(1)).sid;

            const postData = '40{"jwt":"anonymous-ask-user"}';
            const postResponse = await this.axiosInstance.post(`${this.api_url}?EIO=4&transport=polling&t=${t}&sid=${sid}`, postData, {
                headers: { ...this.getHeaders(), 'Content-Type': 'text/plain;charset=UTF-8' },
            });

            if (postResponse.status !== 200 || postResponse.data !== "OK") {
                throw new Provider19Error("Invalid post response", "INVALID_POST_RESPONSE");
            }

            return { sid, t };
        } catch (error) {
            throw new Provider19Error("Failed to create session", "SESSION_CREATION_ERROR", error);
        }
    }

    updateConversationHistory(messages) {
        this.conversationHistory = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    async *generateCompletionStream(messages, temperature, max_tokens, functions, function_call) {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                await this.waitForRateLimit();
                const session = await this.createSession();
                const ws = new WebSocket(`${this.ws_url}?EIO=4&transport=websocket&sid=${session.sid}`, {
                    headers: this.getHeaders(),
                    origin: this.url,
                });
        
                await new Promise((resolve, reject) => {
                    ws.on('open', resolve);
                    ws.on('error', reject);
                });
        
                Logger.debug('Provider19: WebSocket connected');
        
                await this.sendAndWait(ws, "2probe", "3probe");
                ws.send("5");
                await this.waitForMessage(ws, message => message.startsWith('40{"sid":'));
        
                this.updateConversationHistory(messages.slice(0, -1));
        
                const lastUserMessage = messages.filter(msg => msg.role === 'user').pop();
        
                const messageData = {
                    version: "2.9",
                    source: "default",
                    model: this.modelInfo.modelId,
                    messages: [
                        {
                            role: "system",
                            content: `Conversation history:\n${this.conversationHistory}`,
                            priority: 0
                        },
                        {
                            role: "user",
                            content: lastUserMessage.content,
                            priority: 0
                        }
                    ],
                    temperature: temperature,
                    max_tokens: max_tokens,
                    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
                };
        
                if (functions) messageData.functions = functions;
                if (function_call) messageData.function_call = function_call;
        
                ws.send("42" + JSON.stringify(["perplexity_labs", messageData]));
        
                let lastMessage = 0;
                let isFirstChunk = true;
        
                while (true) {
                    const message = await new Promise(resolve => ws.once('message', resolve));
        
                    if (message === "2") {
                        ws.send("3");
                        continue;
                    }
        
                    if (!message.toString().startsWith('42')) {
                        continue;
                    }
        
                    try {
                        const data = JSON.parse(message.toString().slice(2))[1];
                        if (!data || !data.output) {
                            Logger.error('Provider19: No output in received data:', data);
                            continue;
                        }
        
                        const newContent = data.output.slice(lastMessage);
                        lastMessage = data.output.length;
        
                        if (newContent || isFirstChunk) {
                            yield {
                                choices: [{
                                    delta: { content: newContent },
                                    index: 0,
                                    finish_reason: null
                                }]
                            };
                            isFirstChunk = false;
                        }
        
                        if (data.final) {
                            break;
                        }
                    } catch (error) {
                        Logger.error(`Provider19: Message parsing error: ${message}`, error);
                        continue;
                    }
                }
        
                ws.close();
                return;
            } catch (error) {
                Logger.error(`Provider19: Error in generateCompletionStream (attempt ${retries + 1}):`, error);
                retries++;
                if (retries < this.maxRetries) {
                    await sleep(this.retryDelay * Math.pow(2, retries));
                } else {
                    throw new Provider19Error("Failed to generate completion stream after multiple attempts", "STREAM_GENERATION_ERROR", error);
                }
            }
        }
    }

    async sendAndWait(ws, sendMessage, expectedResponse) {
        ws.send(sendMessage);
        const response = await new Promise(resolve => ws.once('message', resolve));
        if (response.toString() !== expectedResponse) {
            throw new Provider19Error(`Unexpected response: ${response}, expected: ${expectedResponse}`, "UNEXPECTED_RESPONSE");
        }
    }

    async waitForMessage(ws, condition) {
        return new Promise((resolve, reject) => {
            const handler = (message) => {
                if (condition(message.toString())) {
                    ws.removeListener('message', handler);
                    resolve(message);
                }
            };
            ws.on('message', handler);
            setTimeout(() => {
                ws.removeListener('message', handler);
                reject(new Provider19Error('Timeout waiting for message', "TIMEOUT_ERROR"));
            }, 10000);
        });
    }
    
    async generateCompletion(messages, temperature, max_tokens, functions, function_call) {
        let retries = 0;
        while (retries < this.maxRetries) {
            try {
                await this.waitForRateLimit();
                const completionChunks = [];
                for await (const chunk of this.generateCompletionStream(messages, temperature, max_tokens, functions, function_call)) {
                    if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                        completionChunks.push(chunk.choices[0].delta.content);
                    }
                }
                
                if (completionChunks.length === 0) {
                    throw new Provider19Error('No content received from stream', "NO_CONTENT_ERROR");
                }
        
                const fullContent = completionChunks.join('');
        
                const result = {
                    content: fullContent,
                    usage: {
                        prompt_tokens: -1,
                        completion_tokens: -1,
                        total_tokens: -1
                    }
                };
        
                return result;
            } catch (error) {
                Logger.error(`Provider19: Error in generateCompletion (attempt ${retries + 1}):`, error);
                retries++;
                if (retries < this.maxRetries) {
                    await sleep(this.retryDelay * Math.pow(2, retries));
                } else {
                    throw new Provider19Error("Failed to generate completion after multiple attempts", "COMPLETION_GENERATION_ERROR", error);
                }
            }
        }
    }
}

module.exports = Provider19;