function formatPrompt(messages, addSpecialTokens = false) {
  if (!Array.isArray(messages) || messages.length === 0) {
    return '';
  }

  if (!addSpecialTokens && messages.length === 1) {
    return messages[0].content;
  }

  const formatted = messages.map(message => 
    `${message.role.charAt(0).toUpperCase() + message.role.slice(1)}: ${message.content}`
  ).join('\n');

  return `${formatted}\nAssistant:`;
}

module.exports = formatPrompt;