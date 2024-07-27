const axios = require('axios');
const fs = require('fs');
const { promisify } = require('util');
const AudioProviderInterface = require('./AudioProviderInterface');

const sleep = promisify(setTimeout);
const readFile = promisify(fs.readFile);

class AudioProvider1 extends AudioProviderInterface {
    constructor() {
        super();
        this.modelInfo = {
            modelId: "whisper-large-v3",
            name: "whisper-large-v3",
            description: "OpenAI's Whisper Large v3 model for speech recognition",
            author: "OpenAI",
            unfiltered: true,
            reverseStatus: "Testing",
            devNotes: "IP rate limit"
        };
        this.apiUrl = "https://api.deepinfra.com/v1/inference/openai/whisper-large-v3";
        this.version = "3d0618527a343f8ad58c34d26542213f0444e901";
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

    async generateTranscription(file, model = 'whisper-large-v3', prompt = '', response_format = 'json', temperature = 0, language = '') {
        try {
            await this.waitForRateLimit();

            let audioBase64;
            if (typeof file === 'string') {
                audioBase64 = await this.convertFileToBase64(file);
            } else if (file instanceof Buffer) {
                audioBase64 = file.toString('base64');
            } else if (typeof file === 'object' && file.buffer instanceof ArrayBuffer) {
                const arrayBuffer = await file.arrayBuffer();
                const buffer = Buffer.from(arrayBuffer);
                audioBase64 = buffer.toString('base64');
            } else {
                throw new Error('Unsupported file format. Please provide a file path, Buffer, or File/Blob object.');
            }

            const response = await axios.post(`${this.apiUrl}?version=${this.version}`, {
                audio: `data:audio/x-m4a;base64,${audioBase64}`,
                initial_prompt: prompt,
                temperature: temperature,
                language: language
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Unique/96.7.5796.97',
                    'Origin': 'https://deepinfra.com',
                    'Referer': 'https://deepinfra.com/',
                    'Accept': 'application/json, text/plain, */*',
                    'Accept-Encoding': 'gzip, deflate, br, zstd',
                    'Accept-Language': 'en-US,en;q=0.9',
                    'Sec-Ch-Ua': '"Not/A)Brand";v="8", "Chromium";v="126", "Google Chrome";v="126"',
                    'Sec-Ch-Ua-Mobile': '?0',
                    'Sec-Ch-Ua-Platform': '"Windows"',
                    'Sec-Fetch-Dest': 'empty',
                    'Sec-Fetch-Mode': 'cors',
                    'Sec-Fetch-Site': 'same-site'
                }
            });

            if (response.status !== 200) {
                throw new Error(`API request failed with status ${response.status}`);
            }

            const result = response.data;

            if (result.inference_status.status !== 'succeeded') {
                throw new Error(`Transcription failed: ${result.inference_status.status}`);
            }

            if (response_format === 'json') {
                return {
                    text: result.text,
                    segments: result.segments,
                    language: result.language,
                    duration: result.input_length_ms / 1000
                };
            } else if (response_format === 'text') {
                return result.text;
            } else {
                throw new Error(`Unsupported response format: ${response_format}`);
            }
        } catch (error) {
            console.error('Error in generateTranscription:', error);
            throw error;
        }
    }

    async convertFileToBase64(filePath) {
        try {
            const data = await readFile(filePath);
            return data.toString('base64');
        } catch (error) {
            throw new Error(`Failed to read file: ${error.message}`);
        }
    }

    async generateSpeech(text, voice, speed) {
        throw new Error("Speech generation is not supported by this provider.");
    }
}

module.exports = AudioProvider1;