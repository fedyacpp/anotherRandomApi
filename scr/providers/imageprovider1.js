const axios = require('axios');
const ImageProviderInterface = require('./ImageProviderInterface');

class ImageProvider1 extends ImageProviderInterface {
  constructor() {
    super({
      modelId: "anythingV5",
      name: "anythingV5",
      description: "Anime styled image generation model",
      author: "Yuno779",
      unfiltered: true,
      reverseStatus: "Testing"
    });
    this.apiUrl = 'https://api.prodia.com';
    this.imageUrl = 'https://images.prodia.xyz';
  }

  async generateImage(prompt, options = {}) {
    try {
      const {
        size = '512x512',
        n = 1,
        negative_prompt = '',
        steps = 25,
        cfg_scale = 7,
        seed = Math.floor(Math.random() * 1000000000),
        sampler = 'DPM++ 2M Karras',
        ...extras
      } = options;

      const [width, height] = size.split('x').map(Number);

      const response = await axios.get(`${this.apiUrl}/generate`, {
        params: {
          new: true,
          prompt,
          model: 'anythingV5_PrtRE.safetensors [893e49b9]',
          negative_prompt,
          steps,
          cfg: cfg_scale,
          seed,
          sampler,
          aspect_ratio: 'square',
          width,
          height,
          ...extras
        },
        headers: {
          'Accept': '*/*',
          'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
          'Origin': 'https://app.prodia.com',
          'Referer': 'https://app.prodia.com/',
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
        }
      });

      const jobId = response.data.job;
      let jobStatus = 'queued';

      while (jobStatus !== 'succeeded') {
        await new Promise(resolve => setTimeout(resolve, 1000));
        const jobResponse = await axios.get(`${this.apiUrl}/job/${jobId}`, {
          headers: {
            'Accept': '*/*',
            'Accept-Language': 'en-US,en;q=0.9,ru-RU;q=0.8,ru;q=0.7',
            'Origin': 'https://app.prodia.com',
            'Referer': 'https://app.prodia.com/',
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'
          }
        });
        jobStatus = jobResponse.data.status;
      }

      const images = [];
      for (let i = 0; i < n; i++) {
        images.push(`${this.imageUrl}/${jobId}.png`);
      }

      return images;
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }
}

module.exports = ImageProvider1;