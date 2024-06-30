const ChatCompletionService = require('../services/chatCompletionService');
const Logger = require('../helpers/logger');

exports.getChatCompletion = async (req, res, next) => {
  try {
    const { model, messages, temperature, stream } = req.body;
    Logger.info(`Processing chat completion request for model: ${model}`);
    
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }
    
    if (stream) {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });

      const streamGenerator = ChatCompletionService.generateCompletionStream(model, messages, temperature);

      for await (const chunk of streamGenerator) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
        
        if (chunk.choices[0].finish_reason === "stop") {
          res.write('data: [DONE]\n\n');
          break;
        }
      }
      
      res.end();
    } else {
      const completion = await ChatCompletionService.generateCompletion(model, messages, temperature);
      Logger.success(`Chat completion generated successfully for model: ${model}`);
      res.json(completion);
    }
  } catch (error) {
    Logger.error(`Error in chat completion: ${error.message}`);
    next(error);
  }
};