const chatOutput = document.getElementById('chat-output');
const userInput = document.getElementById('user-input');
const modelSelect = document.getElementById('model-select');
const temperatureInput = document.getElementById('temperature-input');
const streamingCheckbox = document.getElementById('streaming-checkbox');

let chatHistory = [];

async function fetchModels() {
    try {
        const response = await fetch('/v1/models');
        if (!response.ok) {
            throw new Error('Failed to fetch models');
        }
        const data = await response.json();
        return data.data;
    } catch (error) {
        console.error('Error fetching models:', error);
        addSystemMessage(`Error fetching models: ${error.message}`);
        return [];
    }
}

async function populateModelSelect() {
    const models = await fetchModels();
    modelSelect.innerHTML = '';
    models.forEach(model => {
        const option = document.createElement('option');
        option.value = model.id;
        option.textContent = `${model.id} (${model.description})`;
        modelSelect.appendChild(option);
    });
}

function addMessage(role, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add(`${role}-message`);
    messageElement.textContent = `${role === 'user' ? 'You: ' : 'Bot: '}${content}`;
    chatOutput.appendChild(messageElement);
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

function addSystemMessage(content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('system-message');
    messageElement.textContent = content;
    chatOutput.appendChild(messageElement);
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

async function sendMessage(message) {
    try {
        const model = modelSelect.value;
        const temperature = parseFloat(temperatureInput.value);
        const streaming = streamingCheckbox.checked;

        const response = await fetch('/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: model,
                messages: [...chatHistory, { role: 'user', content: message }],
                temperature: temperature,
                stream: streaming,
            }),
        });

        if (!response.ok) {
            throw new Error('Failed to get response from the server');
        }

        let botReply = '';
        let botMessageElement;

        if (streaming) {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value);
                const lines = chunk.split('\n');
                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const data = JSON.parse(line.slice(5));
                            if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                                botReply += data.choices[0].delta.content;
                                if (!botMessageElement) {
                                    botMessageElement = addMessage('assistant', botReply);
                                } else {
                                    updateMessage(botMessageElement, 'Bot: ' + botReply);
                                }
                            }
                        } catch (error) {
                            console.error('Error parsing JSON:', error);
                        }
                    }
                }
            }
        } else {
            const data = await response.json();
            botReply = data.choices[0].message.content;
            addMessage('assistant', botReply);
        }

        chatHistory.push({ role: 'assistant', content: botReply });

    } catch (error) {
        console.error('Error:', error);
        addSystemMessage(`Error: ${error.message}`);
    }
}

function addMessage(role, content) {
    const messageElement = document.createElement('div');
    messageElement.classList.add(`${role}-message`);
    messageElement.textContent = `${role === 'user' ? 'You: ' : 'Bot: '}${content}`;
    chatOutput.appendChild(messageElement);
    chatOutput.scrollTop = chatOutput.scrollHeight;
    return messageElement;
}

function updateMessage(element, content) {
    element.textContent = content;
    chatOutput.scrollTop = chatOutput.scrollHeight;
}

userInput.addEventListener('keypress', async (e) => {
    if (e.key === 'Enter') {
        const message = userInput.value.trim();
        if (message) {
            addMessage('user', message);
            chatHistory.push({ role: 'user', content: message });
            userInput.value = '';

            if (message.toLowerCase() === 'exit') {
                addSystemMessage('Chat ended. Refresh the page to start a new chat.');
                userInput.disabled = true;
            } else if (message.toLowerCase() === 'clear') {
                chatHistory = [];
                chatOutput.innerHTML = '';
                addSystemMessage('Chat history cleared. Starting a new conversation.');
            } else {
                await sendMessage(message);
            }
        }
    }
});

(async function init() {
    addSystemMessage('Welcome to the Terminal-Style Chatbot!');
    addSystemMessage("Type 'exit' to end the conversation, 'clear' to start a new chat.");
    await populateModelSelect();
})();