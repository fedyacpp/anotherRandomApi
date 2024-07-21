document.addEventListener('DOMContentLoaded', () => {
    const chatMessages = document.getElementById('chat-messages');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const modelSelect = document.getElementById('model-select');
    const temperatureInput = document.getElementById('temperature');
    const streamingCheckbox = document.getElementById('streaming');
    const systemPrompt = document.getElementById('system-prompt');
    const clearChatButton = document.getElementById('clear-chat');
    const imageSizeSelect = document.getElementById('image-size');
    const imageCountInput = document.getElementById('image-count');

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
            modelSelect.addEventListener('change', updateUIForModelType);
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
            option.dataset.type = model.object;
            modelSelect.appendChild(option);
        });
        updateUIForModelType();
    }

    function updateUIForModelType() {
        const selectedModel = modelSelect.options[modelSelect.selectedIndex];
        const isImageModel = selectedModel.dataset.type === 'image_model';
        
        document.querySelectorAll('.chat-setting').forEach(el => el.style.display = isImageModel ? 'none' : 'block');
        document.querySelectorAll('.image-setting').forEach(el => el.style.display = isImageModel ? 'block' : 'none');
    }

    async function sendMessage() {
        const message = userInput.value.trim();
        if (!message) return;

        addMessage('user', message);
        messageHistory.push({ role: 'user', content: message });
        userInput.value = '';

        const selectedModel = modelSelect.options[modelSelect.selectedIndex];
        const isImageModel = selectedModel.dataset.type === 'image_model';

        if (isImageModel) {
            await generateImage(message);
        } else {
            await generateTextResponse(selectedModel.value, message);
        }
    }

    async function generateImage(prompt) {
        const size = imageSizeSelect.value;
        const n = parseInt(imageCountInput.value);
        const quality = document.getElementById('quality').value;
        const style = document.getElementById('style').value;
        const negativePrompt = document.getElementById('negative-prompt').value;
        const seed = document.getElementById('seed').value ? parseInt(document.getElementById('seed').value) : null;
        const steps = parseInt(document.getElementById('steps').value);
        const cfgScale = parseFloat(document.getElementById('cfg-scale').value);
        const sampler = document.getElementById('sampler').value;
    
        try {
            const response = await fetch('http://localhost:8000/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelSelect.value,
                    prompt: prompt,
                    n: n,
                    size: size,
                    quality: quality,
                    style: style,
                    negative_prompt: negativePrompt,
                    seed: seed,
                    steps: steps,
                    cfg_scale: cfgScale,
                    sampler: sampler
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

    async function generateImage(prompt) {
        const size = imageSizeSelect.value;
        const n = parseInt(imageCountInput.value);
    
        try {
            const response = await fetch('http://localhost:8000/v1/images/generations', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: modelSelect.value,
                    prompt: prompt,
                    n: n,
                    size: size
                }),
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            const contentType = response.headers.get('content-type');
    
            if (contentType && contentType.includes('image/')) {
                const blob = await response.blob();
                const imageUrl = URL.createObjectURL(blob);
                addImageMessage('ai', imageUrl);
            } else if (contentType && contentType.includes('application/json')) {
                const data = await response.json();
                if (data.data && Array.isArray(data.data)) {
                    data.data.forEach(imageData => {
                        if (typeof imageData === 'string') {
                            if (imageData.startsWith('http')) {
                                addImageMessage('ai', imageData);
                            } else {
                                addImageMessage('ai', `data:image/png;base64,${imageData}`);
                            }
                        } else {
                            console.error('Unexpected image data format:', imageData);
                        }
                    });
                } else {
                    console.error('Unexpected response format:', data);
                    throw new Error('Unexpected response format');
                }
            } else {
                throw new Error('Unexpected content type: ' + contentType);
            }
        } catch (error) {
            console.error('Error:', error);
            addMessage('error', 'An error occurred while generating the image: ' + error.message);
        }
    }

    function addImageMessage(sender, imageUrl) {
        const messageElement = document.createElement('div');
        messageElement.classList.add('message', sender);
        
        const textElement = document.createElement('p');
        textElement.textContent = 'Generated image:';
        messageElement.appendChild(textElement);
        
        const imageContainer = document.createElement('div');
        imageContainer.classList.add('image-container');
        
        const image = document.createElement('img');
        image.src = imageUrl;
        image.alt = 'Generated image';
        
        image.onerror = function() {
            console.error('Failed to load image:', imageUrl);
            this.alt = 'Failed to load image';
            this.style.display = 'none';
            const errorText = document.createElement('p');
            errorText.textContent = 'Failed to load image';
            errorText.style.color = 'red';
            imageContainer.appendChild(errorText);
        };
        
        imageContainer.appendChild(image);
        messageElement.appendChild(imageContainer);
        
        chatMessages.appendChild(messageElement);
        chatMessages.scrollTop = chatMessages.scrollHeight;
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