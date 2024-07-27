# Chat and Image Generation API

This project provides an API for chat completion and image generation, supporting multiple providers and models.

## Providers and Models

- 4 text providers with a total of 25 text models
- 2 image generation providers with a total of 6 image models

## Setup

1. Install dependencies: `npm install`
2. Clone cf scraper: `git clone https://github.com/zfcsoftware/cf-clearance-scraper`
3. Open it: `cd cf-clearance-scraper`
4. Install its dependencies: `npm install`
5. Go back to the project directory: `cd ..`
6. Start the server: `node src/main/server.js` or `npx nodemon scr/main/server`

## API Endpoints

- POST /v1/chat/completions: Generate a chat completion
- POST /v1/images/generations: Generate an image
- GET /v1/models: Get information about available models
- GET /test/chat: AVAILABLE ONLY IN DEVELOPMENT MODE (CHANGE IT IN .ENV), fully functioning chat for provider testing

## Adding New Providers

### Text Providers

To add a new text provider:
1. Create new someproviderXYZ.js file in `src/providers/`, where XYZ is a digit
2. Extend the `ProviderInterface` class
3. Implement the `generateCompletion` and `*generateCompletionStream` methods

### Image Providers

To add a new image provider:
1. Create new imageproviderXYZ.js in `src/providers/`, where XYZ is a digit
2. Extend the `ImageProviderInterface` class
3. Implement the `generateImage` method
