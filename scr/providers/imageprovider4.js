const WebSocket = require('ws');
const axios = require('axios');
const FormData = require('form-data');
const crypto = require('crypto');
const ImageProviderInterface = require('./ImageProviderInterface');
const Logger = require('../helpers/logger');
const { ValidationError, TimeoutError, CustomError } = require('../utils/errors');
const { promisify } = require('util');
const sleep = promisify(setTimeout);

class ImageProvider4Error extends CustomError {
  constructor(message, code, originalError = null) {
    super(message, { statusCode: 500, code: code });
    this.name = 'ImageProvider4Error';
    this.originalError = originalError;
  }
}

class ImageProvider4 extends ImageProviderInterface {
  constructor() {
    super({
      modelId: "stable-diffusion-2.1",
      name: "stable-diffusion-2.1",
      description: "Filtered Stable Diffusion 2.1 image generation model",
      author: "Stability AI",
      unfiltered: false,
      reverseStatus: "Testing"
    });
    this.wsUrl = 'wss://stabilityai-stable-diffusion.hf.space/queue/join';
    this.uploadUrl = 'https://imgbb.com/json';
    this.maxRetries = 3;
    this.retryDelay = 1000;
    this.imagesPerRequest = 4;
    this.rateLimiter = {
      tokens: 100,
      refillRate: 50,
      lastRefill: Date.now(),
      capacity: 500
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

  async generateImage(prompt, size, n = 1, options = {}) {
    try {
      Logger.info('Starting image generation', { prompt, size, n, options });
      
      const totalRequests = Math.ceil(n / this.imagesPerRequest);
      let allImages = [];

      for (let i = 0; i < totalRequests; i++) {
        await this.waitForRateLimit();
        
        const remainingImages = n - allImages.length;
        const imagesToGenerate = Math.min(remainingImages, this.imagesPerRequest);
        
        Logger.info(`Generating batch ${i + 1}/${totalRequests}`, { imagesToGenerate });
        
        const images = await this.generateImageBatch(prompt, size, imagesToGenerate, options);
        allImages = allImages.concat(images);
        
        Logger.info(`Batch ${i + 1} complete`, { generatedImages: images.length, totalImages: allImages.length });
        
        if (allImages.length >= n) {
          break;
        }
      }

      return allImages.slice(0, n);
    } catch (error) {
      if (error instanceof ImageProvider4Error) {
        throw error;
      }
      throw new ImageProvider4Error(`Failed to generate images: ${error.message}`, 'IMAGE_GENERATION_ERROR', error);
    }
  }

  async generateImageBatch(prompt, size, n, options) {
    return new Promise((resolve, reject) => {
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
        Logger.info('Received message', { messageType: message.msg });

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
              options.guidance_scale || 7.5,
              size
            ],
            session_hash: sessionHash
          }));
        } else if (message.msg === 'process_completed') {
          if (message.output && message.output.data && message.output.data[0]) {
            let base64Images = message.output.data[0];
            Logger.info('Image generation completed', { imageCount: base64Images.length, requestedCount: n });
            
            base64Images = base64Images.slice(0, n);
            
            try {
              const imageUrls = await Promise.all(base64Images.map(img => this.uploadToImgbb(img)));
              ws.close();
              resolve(imageUrls);
            } catch (error) {
              reject(new ImageProvider4Error('Error uploading images', 'UPLOAD_ERROR', error));
            }
          } else {
            reject(new ImageProvider4Error('Invalid output format', 'INVALID_OUTPUT'));
          }
        }
      });

      ws.on('error', (error) => {
        reject(new ImageProvider4Error('WebSocket error', 'WEBSOCKET_ERROR', error));
      });

      ws.on('close', (code, reason) => {
        Logger.info('WebSocket connection closed', { code, reason: reason.toString() });
      });

      setTimeout(() => {
        ws.close();
        reject(new TimeoutError('WebSocket connection timed out'));
      }, 60000);
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
        throw new ImageProvider4Error('Upload failed', 'UPLOAD_FAILED');
      }
    } catch (error) {
      Logger.error('Error uploading to ImgBB:', {
        error: error.message,
        status: error.response ? error.response.status : 'Unknown',
        data: error.response ? error.response.data : 'No data'
      });

      if (retryCount < this.maxRetries) {
        Logger.info(`Retrying upload (attempt ${retryCount + 1}/${this.maxRetries})`);
        await sleep(this.retryDelay);
        return this.uploadToImgbb(base64Image, retryCount + 1);
      }

      throw new ImageProvider4Error('Max retries reached for upload', 'MAX_RETRIES_REACHED', error);
    }
  }

  generatePHPSESSID() {
    return crypto.randomBytes(13).toString('hex');
  }

  generateAuthToken() {
    return crypto.randomBytes(20).toString('hex');
  }
}

module.exports = ImageProvider4;