const axios = require('axios');
const Logger = require('../helpers/logger');

class provider22 {
  constructor() {
    this.baseUrl = 'https://duckduckgo.com/duckchat/v1';
    this.modelInfo = {
      modelId: "claude-3-haiku",
      name: "claude-3-haiku",
      description: "Latest snapshot of claude-3-haiku",
      context_window: "200000",
      author: "Anthropic",
      unfiltered: true,
      reverseStatus: "Testing",
      devNotes: ""
    };
    this.vqd = null;
    this.historyContent = null;
    this.newMessages = [];
  }

  async getInitialVqd() {
    try {
      const response = await axios.get(`${this.baseUrl}/status`, {
        headers: { ...this.getStatusHeaders(), 'x-vqd-accept': '1' }
      });

      this.vqd = response.headers['x-vqd-4'];
      if (!this.vqd) {
        throw new Error('Failed to extract vqd from status response');
      }

      Logger.info(`provider22: Successfully extracted initial vqd: ${this.vqd}`);
      return this.vqd;
    } catch (error) {
      Logger.error('provider22: Error in getInitialVqd:', error);
      throw error;
    }
  }

  async *generateCompletionStream(messages) {
    try {
      if (!this.vqd) {
        await this.getInitialVqd();
      }

      let payloadMessages;
      if (!this.historyMessage) {
        const historyContent = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        this.historyMessage = {
          role: 'user',
          content: `${historyContent}`
        };
        payloadMessages = [this.historyMessage];
      } else {
        const newMessage = messages[messages.length - 1];
        this.newMessages.push(newMessage);
        payloadMessages = [this.historyMessage, ...this.newMessages];
      }

      const url = `${this.baseUrl}/chat`;
      const payload = {
        model: 'claude-3-haiku-20240307',
        messages: payloadMessages
      };

      const response = await axios.post(url, payload, {
        headers: { ...this.getChatHeaders(this.vqd), 'x-vqd-4': this.vqd },
        responseType: 'stream'
      });

      if (response.headers['x-vqd-4']) {
        this.vqd = response.headers['x-vqd-4'];
        Logger.info(`Provider22: Updated vqd from response: ${this.vqd}`);
      }

      let assistantResponse = '';

      for await (const chunk of response.data) {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.message !== undefined) {
                assistantResponse += data.message;
                yield {
                  choices: [{
                    delta: { content: data.message },
                    index: 0,
                    finish_reason: null
                  }]
                };
              }
            } catch (parseError) {
            }
          }
        }
      }

      this.newMessages.push({
        role: 'assistant',
        content: assistantResponse
      });

      yield {
        choices: [{
          delta: {},
          index: 0,
          finish_reason: "stop"
        }]
      };
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  async generateCompletion(messages) {
    try {
      if (!this.vqd) {
        await this.getInitialVqd();
      }
  
      let payloadMessages;
      if (!this.historyMessage) {
        const historyContent = messages.map(msg => `${msg.role}: ${msg.content}`).join('\n');
        this.historyMessage = {
          role: 'user',
          content: `Current conversation history: ${historyContent}`
        };
        payloadMessages = [this.historyMessage];
      } else {
        const newMessage = messages[messages.length - 1];
        this.newMessages.push(newMessage);
        payloadMessages = [this.historyMessage, ...this.newMessages];
      }
  
      const url = `${this.baseUrl}/chat`;
      const payload = {
        model: 'claude-3-haiku-20240307',
        messages: payloadMessages
      };
  
  
      const response = await axios.post(url, payload, {
        headers: { ...this.getChatHeaders(this.vqd), 'x-vqd-4': this.vqd },
        responseType: 'text'
      });
  
      if (response.headers['x-vqd-4']) {
        this.vqd = response.headers['x-vqd-4'];
      }
  
      const data = response.data;
  
      const lines = data.split('\n');
      let fullMessage = '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const jsonData = JSON.parse(line.slice(6));
            if (jsonData.message) {
              fullMessage += jsonData.message;
            }
          } catch (error) {
          }
        }
      }
  
      if (fullMessage) {
        this.newMessages.push({
          role: 'assistant',
          content: fullMessage
        });
  
        return {
          content: fullMessage,
          usage: {
            prompt_tokens: -1,
            completion_tokens: -1,
            total_tokens: -1
          }
        };
      } else {
        throw new Error('No content in provider response');
      }
    } catch (error) {
      this.handleError(error);
      throw error;
    }
  }

  getStatusHeaders() {
    return {
      'Accept': '*/*',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
      'Cache-Control': 'no-store',
      'Referer': 'https://duckduckgo.com/',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
      'X-Vqd-Accept': '1',
      'Pragma': 'no-cache',
      'TE': 'trailers'
    };
  }

  getChatHeaders(vqd) {
    return {
      'Accept': 'text/event-stream',
      'Accept-Encoding': 'gzip, deflate, br, zstd',
      'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
      'Content-Type': 'application/json',
      'Cookie': 'ah=ru-ru; l=ru-ru; dcm=3',
      'Origin': 'https://duckduckgo.com',
      'Referer': 'https://duckduckgo.com/',
      'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'empty',
      'Sec-Fetch-Mode': 'cors',
      'Sec-Fetch-Site': 'same-origin',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
      'X-Vqd-4': vqd,
      'Pragma': 'no-cache',
      'TE': 'trailers'
    };
  }

  handleError(error) {
    Logger.error('provider22: Error in request:', error);
    if (error.response) {
      Logger.error(`provider22: Error response status: ${error.response.status}`);
      Logger.error(`provider22: Error response headers: ${JSON.stringify(error.response.headers)}`);
      Logger.error(`provider22: Error response data: ${error.response.data}`);
    } else if (error.request) {
      Logger.error('provider22: Error request:', error.request);
    } else {
      Logger.error('provider22: Error message:', error.message);
    }
  }
}

module.exports = provider22;