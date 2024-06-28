# Chat Completion API

Currently only one model - inflection-2.5 also known as pi
This project implements a chat completion API using Node.js and Express.

## Setup

1. Install dependencies: `npm install`
2. Start the server: `node scr/main/server.js `
3. Launch testing interface: `node scr\test\testInterface.js  `

## API Endpoints

- POST /v1/chat/completions: Generate a chat completion
- GET /v1/models: Get information about available models

## Adding New Providers

To add a new provider:
1. Create a new file in `src/providers/`
2. Extend the `ProviderInterface` class
3. Implement the `generateCompletion` method
4. Add the new provider to `ProviderPool.js`
