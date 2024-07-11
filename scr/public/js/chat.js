document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const modelSelect = document.getElementById('model-select');
    const temperatureInput = document.getElementById('temperature');
    const streamingCheckbox = document.getElementById('streaming');
    const systemPrompt = document.getElementById('system-prompt');
    const clearChatButton = document.getElementById('clear-chat');

    let messageHistory = [];

    sendButton.addEventListener('click', sendMessage);
    userInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });
    clearChatButton.addEventListener('click', clearChat);

    loadModels();

    async function loadModels() {
        try {
            const response = await fetch('http://localhost:8000/v1/models');
            if (!response.ok) {
                throw new Error('Failed to fetch models');
            }
            const data = await response.json();
            populateModelSelect(data.data);
        } catch (error) {
            console.error('Error loading models:', error);
            addMessage('error', 'Failed to load AI models. Please try refreshing the page.');
        }
    }

    function populateModelSelect(models) {
        modelSelect.innerHTML = '';
        models.forEach(model => {
            const option = document.createElement('option');
            option.value = model.id;
            option.textContent = model.id;
            modelSelect.appendChild(option);
        });
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        messageHistory.push({ role: 'user', content: message });
        userInput.value = '';

        const model = modelSelect.value;
        const temperature = parseFloat(temperatureInput.value);
        const streaming = streamingCheckbox.checked;
        const systemPromptText = systemPrompt.value.trim();

        let messages = [...messageHistory];
        if (systemPromptText) {
            messages.unshift({ role: 'system', content: systemPromptText });
        }

        try {
            const response = await fetch('http://localhost:8000/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: model,
                    messages: messages,
                    temperature: temperature,
                    stream: streaming
                }),
            });

            if (!response.ok) {
                throw new Error('API request failed');
            }

            if (streaming) {
                const reader = response.body.getReader();
                const decoder = new TextDecoder();
                let aiMessage = '';

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    const chunk = decoder.decode(value);
                    const lines = chunk.split('\n');
                    for (const line of lines) {
                        if (line.startsWith('data: ')) {
                            const content = line.slice(6);
                            if (content.trim() === '[DONE]') {
                                break;
                            }
                            try {
                                const data = JSON.parse(content);
                                if (data.choices && data.choices[0].delta.content) {
                                    aiMessage += data.choices[0].delta.content;
                                    updateAIMessage(aiMessage);
                                }
                            } catch (error) {
                                console.error('Error parsing JSON:', error);
                            }
                        }
                    }
                }
                messageHistory.push({ role: 'assistant', content: aiMessage });
            } else {
                const data = await response.json();
                const aiMessage = data.choices[0].message.content;
                addMessage('ai', aiMessage);
                messageHistory.push({ role: 'assistant', content: aiMessage });
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('error', 'An error occurred while fetching the response.');
        }
    }

    function addMessage(sender, content) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        messageElement.textContent = content;
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function updateAIMessage(content) {
        let aiMessage = chatMessages.querySelector('.message.ai:last-child');
        if (!aiMessage) {
            aiMessage = document.createElement('div');
            aiMessage.classList.add('message', 'ai');
            chatMessages.appendChild(aiMessage);
        }
        aiMessage.textContent = content;
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    function clearChat() {
        chatMessages.innerHTML = '';
        messageHistory = [];
        systemPrompt.value = '';
    }
});