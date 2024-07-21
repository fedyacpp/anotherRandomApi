const WebSocket = require('ws');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const ImageProviderInterface = require('./ImageProviderInterface');
const Logger = require('../helpers/logger');

class ImageProvider4 extends ImageProviderInterface {
  constructor() {
    super({
      modelId: "stable-diffusion-2.1",
      name: "stable-diffusion-2.1",
      description: "Filtered Stable Diffusion 2.1 image generation model",
      author: "Stability AI",
      unfiltered: false,
      reverseStatus: "Stable"
    });
    this.wsUrl = 'wss://stabilityai-stable-diffusion.hf.space/queue/join';
    this.uploadUrl = 'https://imgbb.com/json';
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  generatePHPSESSID() {
    return crypto.randomBytes(13).toString('hex');
  }

  generateAuthToken() {
    return crypto.randomBytes(20).toString('hex');
  }

  async generateImage(prompt, options = {}) {
    return new Promise((resolve, reject) => {
      Logger.info('Connecting to WebSocket', { url: this.wsUrl });
      const ws = new WebSocket(this.wsUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Origin': 'https://stabilityai-stable-diffusion.hf.space',
          'Sec-WebSocket-Extensions': 'permessage-deflate; client_max_window_bits',
        }
      });

      let sessionHash = crypto.randomBytes(16).toString('hex');

      ws.on('open', () => {
        Logger.info('WebSocket connection opened');
      });

      ws.on('message', async (data) => {
        const message = JSON.parse(data);
        Logger.info('Received message');

        if (message.msg === 'send_hash') {
          Logger.info('Sending session hash', { sessionHash });
          ws.send(JSON.stringify({
            session_hash: sessionHash,
            fn_index: 3
          }));
        } else if (message.msg === 'send_data') {
          Logger.info('Sending image generation data');
          ws.send(JSON.stringify({
            fn_index: 3,
            data: [
              prompt,
              options.negative_prompt || "",
              options.guidance_scale || 7.5
            ],
            session_hash: sessionHash
          }));
        } else if (message.msg === 'process_completed') {
          if (message.output && message.output.data && message.output.data[0]) {
            const base64Images = message.output.data[0];
            Logger.info('Image generation completed', { imageCount: base64Images.length });
            
            try {
              const imageUrls = await Promise.all(base64Images.map(img => this.uploadToImgbb(img)));
              ws.close();
              resolve(imageUrls);
            } catch (error) {
              Logger.error('Error uploading images', { error: error.message });
              reject(error);
            }
          } else {
            Logger.error('Invalid output format', { output: message.output });
            reject(new Error('Invalid output format'));
          }
        }
      });

      ws.on('error', (error) => {
        Logger.error('WebSocket error:', error);
        reject(error);
      });

      ws.on('close', (code, reason) => {
        Logger.info('WebSocket connection closed', { code, reason: reason.toString() });
      });
    });
  }

  async uploadToImgbb(base64Image, retryCount = 0) {
    const imageBuffer = Buffer.from(base64Image.split(',')[1], 'base64');
    const formData = new FormData();
    formData.append('source', imageBuffer, {
      filename: 'image.png',
      contentType: 'image/png',
    });
    formData.append('type', 'file');
    formData.append('action', 'upload');
    formData.append('timestamp', Date.now().toString());
    formData.append('auth_token', this.generateAuthToken());

    const sessionId = this.generatePHPSESSID();

    try {
      const response = await axios.post(this.uploadUrl, formData, {
        headers: {
          ...formData.getHeaders(),
          'Cookie': `PHPSESSID=${sessionId}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
          'Origin': 'https://imgbb.com',
          'Referer': 'https://imgbb.com/'
        }
      });

      if (response.data && response.data.success) {
        return response.data.image.url;
      } else {
        throw new Error('Upload failed: ' + JSON.stringify(response.data));
      }
    } catch (error) {
      Logger.error('Error uploading to ImgBB:', {
        error: error.message,
        status: error.response ? error.response.status : 'Unknown',
        data: error.response ? error.response.data : 'No data'
      });

      if (retryCount < this.maxRetries) {
        Logger.info(`Retrying upload (attempt ${retryCount + 1}/${this.maxRetries})`);
        await new Promise(resolve => setTimeout(resolve, this.retryDelay));
        return this.uploadToImgbb(base64Image, retryCount + 1);
      }

      throw error;
    }
  }
}

module.exports = ImageProvider4;