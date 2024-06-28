async function formatPrompt(messages) {
  console.log('Messages received in formatPrompt:', messages);

  if (typeof messages === 'string') {
    return messages;
  }

  if (!Array.isArray(messages)) {
    console.error('Messages is not an array or string:', messages);
    return '';
  }

  if (messages.length === 0) {
    console.warn('Messages array is empty');
    return '';
  }

  const formatted = messages.map(message => {
    if (typeof message !== 'object' || !message.role || !message.content) {
      console.warn('Invalid message format:', message);
      return '';
    }
    return `${message.role.charAt(0).toUpperCase() + message.role.slice(1)}: ${message.content}`;
  }).filter(Boolean).join('\n');

  return `${formatted}\nAssistant:`;
}

module.exports = formatPrompt;