# Chat and Image Generation API

!!Add your 2 rotate http proxies in .env!!
This project provides a robust API for chat completion and image generation, supporting multiple providers and models. It's designed for scalability, performance, and easy integration of new providers.

## Features

- Multi-provider support for both text and image generation
- `4` text providers with `32` text models
- `2` image generation providers with `6` image models
- Scalable architecture with worker clustering
- Rate limiting and API key authentication (auth needs testing, i haven't tried it)
- Graceful error handling and shutdown

## Prerequisites

- Node.js (v14 or later recommended)
- npm (v6 or later)
- Git

## Setup

1. Clone the repository:
   ```
   git clone https://github.com/fedyacpp/anotherRandomApi
   cd anotherRandomApi
   ```

2. Install dependencies:
   ```
   npm install
   ```

3. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Edit `.env` and set your configuration

5. Start the server:
   ```
   node scr/main/server.js
   ```
   or for development:
   ```
   npx nodemon scr/main/server
   ```

## API Endpoints

- `POST /v1/chat/completions`: Generate a chat completion
- `POST /v1/images/generations`: Generate an image
- `GET /v1/models`: Get information about available models
- `GET /test/chat`: Test endpoint for chat (available only in development mode)

## Adding New Providers

### Text Providers

1. Create a new file `src/providers/someproviderXYZ.js` (where XYZ is a digit)
2. Extend the `ProviderInterface` class
3. Implement `generateCompletion` and `*generateCompletionStream` methods

### Image Providers

1. Create a new file `src/providers/imageproviderXYZ.js` (where XYZ is a digit)
2. Extend the `ImageProviderInterface` class
3. Implement the `generateImage` method

## Configuration

Key configuration options in `.env`:

- `SERVER_PORT`: Server port (default: 3000)
- `NODE_ENV`: Environment (development/production)
- `LOG_LEVEL`: Logging level
- `VALID_API_KEYS`: Blank API keys for authentication

## Notes

- For the Liaobots provider to work, you need to use a rotating HTTP proxy in `src/helpers/authCodeManager.js`
- Ensure proper error handling when integrating new providers