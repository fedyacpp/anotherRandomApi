const ChatCompletionService = require('../services/ChatCompletionService');
const Logger = require('../helpers/logger');

exports.getChatCompletion = async (req, res, next) => {
  try {
    const { model, messages, temperature } = req.body;
    Logger.info(`Processing chat completion request for model: ${model}`);
    
    if (!Array.isArray(messages)) {
      throw new Error('Messages must be an array');
    }
    
    const processedMessages = messages.map(message => 
      `${message.role}: ${message.content}`
    ).join('\n');
    
    Logger.info('Processed messages:', processedMessages);
    
    const completion = await ChatCompletionService.generateCompletion(model, processedMessages, temperature);
    
    Logger.success(`Chat completion generated successfully for model: ${model}`);
    res.json(completion);
  } catch (error) {
    Logger.error(`Error in chat completion: ${error.message}`);
    next(error);
  }
};