# Chat Completion API

Currently three providers - pi.ai, perplexity and liaobots.

This project implements a chat completion API using Node.js and Express.

## Setup

1. Install dependencies: `npm install`
2. Start the server: `node scr\main\server.js`
3. Launch testing interface: `node scr\test\testInterface.js`

## API Endpoints

- POST /v1/chat/completions: Generate a chat completion
- GET /v1/models: Get information about available models
- GET /test/chat: WORKS ONLY IN DEVELOPMENT MODE (CHANGE IT IN .ENV), fully functioning chat for provider testing

## Adding New Providers

To add a new provider:
1. Create a new file in `src/providers/`
2. Extend the `ProviderInterface` class
3. Implement the `generateCompletion` and `*generateCompletionStream` methods
4. Add the new provider to `ProviderPool.js`
