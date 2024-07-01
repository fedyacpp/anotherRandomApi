const WebSocket = require('ws');
const axios = require('axios');
const tough = require('tough-cookie');
const Logger = require('../helpers/logger');
const BrowserManager = require('../helpers/browser');

class Provider12 {
    constructor() {
        this.url = "https://labs.perplexity.ai";
        this.api_url = "https://www.perplexity.ai/socket.io/";
        this.ws_url = "wss://www.perplexity.ai/socket.io/";
        this.modelInfo = {
            modelId: "mixtral-8x7b-instruct",
            name: "mixtral-8x7b-instruct",
            description: "Mixtral 8x7B Instruct model",
            context_window: 4000,
            author: "Mistral AI",
        };
        this.cookieJar = new tough.CookieJar();
        this.axiosInstance = axios.create({
            withCredentials: true
        });
        this.conversationHistory = "";
        this.browserManager = new BrowserManager({
            url: 'https://labs.perplexity.ai'
        });
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

    async createSession() {
        const t = Math.floor(Math.random() * 0xFFFFFFFF).toString(16).padStart(8, '0');
        const response = await this.axiosInstance.get(`${this.api_url}?EIO=4&transport=polling&t=${t}`, {
            headers: this.getHeaders()
        });

        if (response.status !== 200 || !response.data.startsWith("0")) {
            throw new Error("Invalid response format");
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
            throw new Error("Invalid post response");
        }

        return { sid, t };
    }

    updateConversationHistory(messages) {
        this.conversationHistory = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
    }

    async *generateCompletionStream(messages, temperature) {
        try {
            const session = await this.createSession();
            const ws = new WebSocket(`${this.ws_url}?EIO=4&transport=websocket&sid=${session.sid}`, {
                headers: this.getHeaders(),
                origin: this.url,
            });
    
            await new Promise((resolve, reject) => {
                ws.on('open', resolve);
                ws.on('error', reject);
            });
    
            Logger.debug('WebSocket connected');
    
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
                timezone: Intl.DateTimeFormat().resolvedOptions().timeZone
            };
    
            ws.send("42" + JSON.stringify(["perplexity_labs", messageData]));
    
            let lastMessage = 0;
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
                        Logger.error('No output in received data:', data);
                        continue;
                    }
                    const newContent = data.output.slice(lastMessage);
                    lastMessage = data.output.length;
    
    
                    yield {
                        choices: [{
                            delta: { content: newContent },
                            index: 0,
                            finish_reason: data.final ? "stop" : null
                        }]
                    };
    
                    if (data.final) break;
                } catch (error) {
                    Logger.error(`Message parsing error: ${message}`, error);
                    continue;
                }
            }
    
            ws.close();
        } catch (error) {
            Logger.error('Error in generateCompletionStream:', error);
            const customError = new Error('Failed to generate completion stream');
            customError.name = 'ProviderError';
            customError.originalError = error;
            throw customError;
        }
    }    

    async sendAndWait(ws, sendMessage, expectedResponse) {
        ws.send(sendMessage);
        const response = await new Promise(resolve => ws.once('message', resolve));
        if (response.toString() !== expectedResponse) {
            throw new Error(`Unexpected response: ${response}, expected: ${expectedResponse}`);
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
                reject(new Error('Timeout waiting for message'));
            }, 10000);
        });
    }
    
    async generateCompletion(messages, temperature) {
        try {
            const completionChunks = [];
            for await (const chunk of this.generateCompletionStream(messages, temperature)) {
                if (chunk.choices && chunk.choices[0] && chunk.choices[0].delta && chunk.choices[0].delta.content) {
                    completionChunks.push(chunk.choices[0].delta.content);
                }
            }
            
            if (completionChunks.length === 0) {
                throw new Error('No content received from stream');
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
            Logger.error('Error in generateCompletion:', error);
            throw error;
        }
    }
}

module.exports = Provider12;
