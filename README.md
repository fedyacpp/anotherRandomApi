# Chat Completion API

Currently four providers.

## Setup

1. Install dependencies: `npm install`
2. Clone cf scraper: `git clone https://github.com/zfcsoftware/cf-clearance-scraper`
3. Open it: `cd cf-clearance-scraper`
4. Install it's dependencies: `npm install`
5. Go back to the project directory: `cd ..`
6. Start the server: `node scr\main\server.js`

## API Endpoints

- POST /v1/chat/completions: Generate a chat completion
- POST /v1/images/generations: Generate an image
- GET /v1/models: Get information about available models
- GET /test/chat: AVAILABLE ONLY IN DEVELOPMENT MODE (CHANGE IT IN .ENV), fully functioning chat for provider testing

## Adding New Providers

To add a new provider:
1. Create a new file in `src/providers/`
2. Extend the `ProviderInterface` class
3. Implement the `generateCompletion` and `*generateCompletionStream` methods
