async function formatPrompt(messages) {
  console.log('Messages received in formatPrompt:', messages);

  if (typeof messages === 'string') {
    return messages;
  }

  if (!Array.isArray(messages)) {
    const error = new Error('Messages must be an array or string');
    error.name = 'ValidationError';
    error.errors = { messages: 'Invalid format' };
    throw error;
  }

  if (messages.length === 0) {
    const error = new Error('Messages array is empty');
    error.name = 'ValidationError';
    error.errors = { messages: 'Empty array' };
    throw error;
  }

  const formatted = messages.map(message => {
    if (typeof message !== 'object' || !message.role || !message.content) {
      const error = new Error('Invalid message format');
      error.name = 'ValidationError';
      error.errors = { message: 'Invalid format' };
      throw error;
    }
    return `${message.role.charAt(0).toUpperCase() + message.role.slice(1)}: ${message.content}`;
  }).join('\n');

  return `${formatted}\nAssistant:`;
}

module.exports = formatPrompt;