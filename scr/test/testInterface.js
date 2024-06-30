const axios = require('axios');
const readline = require('readline');
const chalk = require('chalk');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const API_URL = 'http://localhost:8000/v1/chat/completions';
const MODEL = "claude-3.5-sonnet";
const USE_STREAMING = true;
const FULL = true;

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
      if (USE_STREAMING) {
        await streamingChat(chatHistory);
      } else {
        await nonStreamingChat(chatHistory);
      }
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
  let fullResponse = [];
  process.stdout.write(chalk.blue("Bot: "));

  for await (const chunk of response.data) {
    const lines = chunk.toString().split('\n').filter(line => line.trim() !== '');
    for (const line of lines) {
      const message = line.replace(/^data: /, '');
      if (message === '[DONE]') {
        break;
      }

      try {
        const parsed = JSON.parse(message);
        fullResponse.push(parsed);
        if (parsed.choices && parsed.choices[0].delta) {
          if (parsed.choices[0].delta.content) {
            const content = parsed.choices[0].delta.content;
            process.stdout.write(chalk.blue(content));
            botReply += content;
          }
        }
      } catch (error) {
        console.error(chalk.red('Error parsing stream message:', error));
      }
    }
  }

  if (botReply) {
    chatHistory.push({ role: "assistant", content: botReply });
  } else {
    console.log(chalk.yellow("Bot did not provide a response."));
  }

  if (FULL && fullResponse.length > 0) {
    console.log(chalk.gray("Full API Response:"));
    console.log(chalk.gray(JSON.stringify(fullResponse, null, 2)));
  }
}

async function nonStreamingChat(chatHistory) {
  const response = await axios.post(API_URL, {
    model: MODEL,
    messages: chatHistory,
    temperature: 0.7,
    stream: false
  }, {
    headers: { 'Content-Type': 'application/json' }
  });

  if (response.data.choices && response.data.choices[0].message) {
    const botReply = response.data.choices[0].message.content;
    console.log(chalk.blue("Bot: " + botReply));
    chatHistory.push({ role: "assistant", content: botReply });

    if (response.data.usage) {
      console.log(chalk.gray(`Tokens used: ${response.data.usage.total_tokens}`));
    }
  } else {
    console.log(chalk.yellow("Bot did not provide a response."));
  }

  if (FULL) {
    console.log(chalk.gray("Full API Response:"));
    console.log(chalk.gray(JSON.stringify(response.data, null, 2)));
  }
}

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

chat();