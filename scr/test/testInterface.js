const axios = require('axios');
const readline = require('readline');
const chalk = require('chalk');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const API_URL = 'http://localhost:8000/v1/chat/completions';
const MODEL = "gpt-4-turbo-2024-04-09";

async function chat() {
  console.log(chalk.blue("Welcome to the Terminal Chatbot!"));
  console.log(chalk.yellow("Type 'exit' to end the conversation, 'clear' to start a new chat."));

  let chatHistory = [];

  while (true) {
    const userInput = await askQuestion(chalk.green("You: "));

    if (userInput.toLowerCase() === 'exit') {
      console.log(chalk.blue("Goodbye!"));
      rl.close();
      break;
    }

    if (userInput.toLowerCase() === 'clear') {
      chatHistory = [];
      console.log(chalk.yellow("Chat history cleared. Starting a new conversation."));
      continue;
    }

    chatHistory.push({ role: "user", content: userInput });

    try {
      await streamingChat(chatHistory);
    } catch (error) {
      console.error(chalk.red('Error:', error.message));
      console.log(chalk.red("Bot: Sorry, I encountered an error while processing your request."));
    }
  }
}

async function streamingChat(chatHistory) {
  const response = await axios.post(API_URL, {
    model: MODEL,
    messages: chatHistory,
    temperature: 0.7,
    stream: true
  }, {
    headers: { 'Content-Type': 'application/json' },
    responseType: 'stream'
  });

  let botReply = '';
  process.stdout.write(chalk.blue("Bot: "));

  for await (const chunk of response.data) {
    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      const message = line.replace(/^data: /, '');
      if (message === '[DONE]') {
        process.stdout.write('\n');
        return;
      }
      try {
        const parsed = JSON.parse(message);
        const content = parsed.choices[0].delta.content;
        if (content) {
          process.stdout.write(chalk.blue(content));
          botReply += content;
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      } catch (error) {
        console.error(chalk.red('Error parsing stream message:', error));
      }
    }
  }

  chatHistory.push({ role: "assistant", content: botReply });
}

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

chat();