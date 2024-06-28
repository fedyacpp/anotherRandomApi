const axios = require('axios');
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

async function chat() {
  console.log("Welcome to the Terminal Chatbot!");
  console.log("Type 'exit' to end the conversation.");

  while (true) {
    const userInput = await askQuestion("You: ");

    if (userInput.toLowerCase() === 'exit') {
      console.log("Goodbye!");
      rl.close();
      break;
    }

    try {
      const response = await axios.post('http://localhost:8000/v1/chat/completions', {
        model: "inflection-2.5",
        messages: [{ role: "user", content: userInput }],
        temperature: 0.7
      }, {
        headers: {
          'Content-Type': 'application/json'
        }
      });

      const botReply = response.data.choices[0].message.content;
      console.log("Bot:", botReply);
    } catch (error) {
      console.error('Error:', error.message);
      console.log("Bot: Sorry, I encountered an error while processing your request.");
    }
  }
}

function askQuestion(query) {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

chat();