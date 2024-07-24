const axios = require('axios');
const https = require('https');
const { promisify } = require('util');
const sleep = promisify(setTimeout);
const ImageProviderInterface = require('./ImageProviderInterface');
const Logger = require('../helpers/logger');

class ImageProvider2Error extends Error {
  constructor(message, code, originalError = null) {
    super(message);
    this.name = 'ImageProvider2Error';
    this.code = code;
    this.originalError = originalError;
  }
}

class ImageProvider2 extends ImageProviderInterface {
  constructor() {
    super();
    this.modelInfo = {
      modelId: "anythingV4.5",
      name: "anythingV4.5",
      description: "An enhanced iteration of the Anything series, providing high-quality anime-styled image generation with refined aesthetics",
      author: "Yuno779",
      unfiltered: true,
      reverseStatus: "Testing"
    };
    this.apiUrl = 'https://api.prodia.com';
    this.imageUrl = 'https://images.prodia.xyz';
    this.maxAttempts = 3;
    this.rateLimiter = {
      tokens: 100,
      refillRate: 50,
      lastRefill: Date.now(),
      capacity: 500
    };
  }

  getAxiosConfig() {
    return {
      headers: {
        'Accept': '*/*',
        'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
        'Origin': 'https://app.prodia.com',
        'Referer': 'https://app.prodia.com/',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
      },
      httpsAgent: new https.Agent({ 
        rejectUnauthorized: false,
        keepAlive: true,
        maxSockets: 100
      }),
      timeout: 60000,
      validateStatus: status => status >= 200 && status < 400
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

  async makeRequest(endpoint, params) {
    await this.waitForRateLimit();
    
    try {
      const response = await axios.get(`${this.apiUrl}${endpoint}`, {
        ...this.getAxiosConfig(),
        params
      });
      return response;
    } catch (error) {
      throw new ImageProvider2Error(`Error making request to ${endpoint}`, 'REQUEST_ERROR', error);
    }
  }

  async generateImage(prompt, size, n = 1, options = {}) {
    const [width, height] = size.split('x').map(Number);
    const {
      negative_prompt = '',
      steps = 25,
      cfg_scale = 7,
      seed = Math.floor(Math.random() * 1000000000),
      sampler = 'DPM++ 2M Karras',
      quality = 'standard',
      style = 'natural',
      ...extras
    } = options;

    const images = [];
    for (let i = 0; i < n; i++) {
      for (let attempt = 0; attempt < this.maxAttempts; attempt++) {
        try {
          const response = await this.makeRequest('/generate', {
            new: true,
            prompt,
            model: 'anything-v4.5-pruned.ckpt [65745d25]',
            negative_prompt,
            steps,
            cfg: cfg_scale,
            seed: seed ? seed + i : Math.floor(Math.random() * 1000000000),
            sampler,
            aspect_ratio: 'square',
            width,
            height,
            quality,
            style,
            ...extras
          });

          const jobId = response.data.job;
          let jobStatus = 'queued';

          while (jobStatus !== 'succeeded') {
            await sleep(1000);
            const jobResponse = await this.makeRequest(`/job/${jobId}`);
            jobStatus = jobResponse.data.status;
          }

          images.push(`${this.imageUrl}/${jobId}.png`);
          break;
        } catch (error) {
          Logger.error(`Error in image generation (attempt ${attempt + 1}): ${error.message}`);
          if (attempt === this.maxAttempts - 1) {
            throw new ImageProvider2Error('Failed to generate image', 'IMAGE_GENERATION_ERROR', error);
          }
        }
      }
    }

    return images;
  }
}

module.exports = ImageProvider2;