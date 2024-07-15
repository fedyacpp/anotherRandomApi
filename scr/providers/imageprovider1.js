const axios = require('axios');
const ImageProviderInterface = require('./ImageProviderInterface');

class ProdiaImageProvider extends ImageProviderInterface {
  constructor() {
    super({
      modelId: "Prodia",
      name: "prodia",
      description: "Prodia image generation API",
      author: "Prodia",
      unfiltered: true,
      reverseStatus: "Testing"
    });
    this.apiUrl = 'https://api.prodia.com';
    this.imageUrl = 'https://images.prodia.xyz';
  }

  async generateImage(prompt, size, n = 1) {
    try {
      const response = await axios.get(`${this.apiUrl}/generate`, {
        params: {
          new: true,
          prompt: prompt,
          model: 'AOM3A3_orangemixs.safetensors [9600da17]',
          negative_prompt: '',
          steps: 25,
          cfg: 8,
          seed: Math.floor(Math.random() * 1000000000),
          sampler: 'DPM++ 2M Karras',
          aspect_ratio: 'square',
          width: size,
          height: size
        }
      });

      const jobId = response.data.job;
      let jobStatus = 'queued';

      while (jobStatus !== 'succeeded') {
        const jobResponse = await axios.get(`${this.apiUrl}/job/${jobId}`);
        jobStatus = jobResponse.data.status;
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      const images = [];
      for (let i = 0; i < n; i++) {
        const imageResponse = await axios.get(`${this.imageUrl}/${jobId}.png`, {
          params: {
            download: 1
          },
          responseType: 'arraybuffer'
        });
        const imageBuffer = Buffer.from(imageResponse.data, 'binary');
        images.push(imageBuffer);
      }

      return images;
    } catch (error) {
      console.error('Error generating image:', error);
      throw error;
    }
  }
}

module.exports = ProdiaImageProvider;