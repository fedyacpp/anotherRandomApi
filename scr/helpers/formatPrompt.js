function formatPrompt(messages) {
  if (typeof messages === 'string') {
    return messages;
  }

  if (!Array.isArray(messages)) {
    return messages;
  }

  if (messages.length === 0) {
    return '';
  }

  return messages.map(message => `${message.role}: ${message.content}`).join('\n');
}

module.exports = formatPrompt;