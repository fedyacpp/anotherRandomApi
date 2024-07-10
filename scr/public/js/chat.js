class AITerminal {
    constructor() {
        this.terminalOutput = document.getElementById('terminal-output');
        this.terminalInput = document.getElementById('terminal-input');
        this.prompt = document.getElementById('prompt');
        
        this.commandHistory = [];
        this.chatHistory = [];
        this.historyIndex = -1;
        this.useStreaming = true;
        
        this.fileSystem = {
            '/': {
                'home': {
                    'user': {
                        'documents': {
                            'readme.txt': 'Welcome to AI Terminal!'
                        },
                        'projects': {
                            'hello-world.js': 'console.log("Hello, World!");'
                        }
                    }
                },
                'etc': {
                    'motd': 'Welcome to AI Terminal v1.0'
                },
                'var': {
                    'log': {
                        'system.log': 'System boot completed successfully.'
                    }
                }
            }
        };
        this.currentDirectory = ['/','home','user'];
        
        this.aiModel = 'gpt-3.5-turbo-0125';
        this.aiTemperature = 0.7;
        this.isAIResponding = false;
        this.inputLine = document.getElementById('input-line');
        this.inputCursor = document.getElementById('input-cursor');
        
        this.updateCursorPosition();
        this.initEventListeners();
        this.initializeTerminal();
    }

    updateCursorPosition() {
        const inputValue = this.terminalInput.value;
        const cursorPosition = this.terminalInput.selectionStart;
        const promptWidth = this.prompt.offsetWidth;
        
        const tempSpan = document.createElement('span');
        tempSpan.style.visibility = 'hidden';
        tempSpan.style.position = 'absolute';
        tempSpan.style.whiteSpace = 'pre';
        tempSpan.style.font = getComputedStyle(this.terminalInput).font;
        tempSpan.textContent = inputValue.substring(0, cursorPosition);
        document.body.appendChild(tempSpan);

        const cursorLeft = promptWidth + tempSpan.offsetWidth;
        this.inputCursor.style.left = `${cursorLeft + 6}px`;
        this.inputCursor.style.bottom = '4px';

        document.body.removeChild(tempSpan);
    }    

    initEventListeners() {
        this.terminalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.handleUserInput();
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                this.navigateHistory(-1);
            } else if (e.key === 'ArrowDown') {
                e.preventDefault();
                this.navigateHistory(1);
            } else if (e.key === 'Tab') {
                e.preventDefault();
                this.autocomplete();
            }
        });

        document.addEventListener('paste', (e) => {
            const pastedText = e.clipboardData.getData('text');
            this.terminalInput.value += pastedText;
        });
        this.terminalInput.addEventListener('keyup', () => this.updateCursorPosition());
        this.terminalInput.addEventListener('click', () => this.updateCursorPosition());
        this.terminalInput.addEventListener('select', () => this.updateCursorPosition());
    }

    initializeTerminal() {
        this.simulateBootSequence().then(() => {
            this.printSystemMessage('Welcome to AI Terminal v1.0');
            this.printSystemMessage('Type "help" for available commands or start chatting.');
            this.updatePrompt();
            this.focusInput();
        });
    }

    async simulateBootSequence() {
        const bootMessages = [
            'Initializing system...',
            'Loading kernel...',
            'Mounting file system...',
            'Starting AI services...',
            'Boot sequence complete.'
        ];

        for (const message of bootMessages) {
            await this.delay(500);
            this.printSystemMessage(message);
        }
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    printSystemMessage(message) {
        const outputElement = document.createElement('div');
        outputElement.classList.add('system-output');
        outputElement.textContent = message;
        this.terminalOutput.appendChild(outputElement);
        this.scrollToBottom();
    }    

    printUserInput(input) {
        const outputElement = document.createElement('div');
        outputElement.classList.add('user-input');
        outputElement.textContent = `${this.prompt.textContent} ${input}`;
        this.terminalOutput.appendChild(outputElement);
        this.scrollToBottom();
    }

    printAIOutput(message) {
        const outputElement = document.createElement('div');
        outputElement.classList.add('ai-output');
        outputElement.textContent = message;
        this.terminalOutput.appendChild(outputElement);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.terminalOutput.scrollTop = this.terminalOutput.scrollHeight;
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight) {
            window.scrollTo(0, document.body.scrollHeight);
        }
    }    

    updatePrompt() {
        const currentDir = this.currentDirectory.join('/');
        this.prompt.textContent = `user@ai-terminal:${currentDir}$`;
    }

    handleUserInput() {
        if (this.isAIResponding) return;

        const input = this.terminalInput.value.trim();
        if (!input) return;

        this.printUserInput(input);
        this.commandHistory.unshift(input);
        this.historyIndex = -1;
        this.terminalInput.value = '';
        this.updateCursorPosition();

        if (this.isCommand(input)) {
            this.executeCommand(input);
        } else {
            this.sendMessageToAI(input);
        }
    }

    focusInput() {
        this.terminalInput.focus();
        this.updateCursorPosition();
    }

    isCommand(input) {
        const commands = ['clear', 'help', 'exit', 'ls', 'cd', 'cat', 'model', 'temp', 'echo', 'date', 'whoami', 'pwd', 'tree', 'mode'];
        return commands.some(cmd => input.toLowerCase().startsWith(cmd));
    }

    executeCommand(command) {
        const [cmd, ...args] = command.toLowerCase().split(' ');
        switch (cmd) {
            case 'clear':
                this.scrollToBottom();
                this.clearTerminal();
                this.scrollToBottom();
                break;
            case 'help':
                this.scrollToBottom();
                this.showHelp();
                this.scrollToBottom();
                break;
            case 'exit':
                this.scrollToBottom();
                this.exitTerminal();
                this.scrollToBottom();
                break;
            case 'ls':
                this.scrollToBottom();
                this.listDirectory(args[0]);
                this.scrollToBottom();
                break;
            case 'cd':
                this.scrollToBottom();
                this.changeDirectory(args[0]);
                this.scrollToBottom();
                break;
            case 'cat':
                this.scrollToBottom();
                this.catFile(args[0]);
                this.scrollToBottom();
                break;
            case 'model':
                this.scrollToBottom();
                this.setAIModel(args[0]);
                this.scrollToBottom();
                break;
            case 'temp':
                this.scrollToBottom();
                this.setAITemperature(args[0]);
                this.scrollToBottom();
                break;
            case 'echo':
                this.scrollToBottom();
                this.echo(args.join(' '));
                this.scrollToBottom();
                break;
            case 'date':
                this.scrollToBottom();
                this.showDate();
                this.scrollToBottom();
                break;
            case 'whoami':
                this.scrollToBottom();
                this.showWhoami();
                this.scrollToBottom();
                break;
            case 'pwd':
                this.scrollToBottom();
                this.showPwd();
                this.scrollToBottom();  
                break;
            case 'tree':
                this.scrollToBottom();
                this.showTree(args[0]);
                this.scrollToBottom();
                break;
            case 'mode':
                this.scrollToBottom();
                this.toggleResponseMode();
                this.scrollToBottom();
                break;
            default:
                this.scrollToBottom();
                this.printSystemMessage(`Unknown command: ${cmd}`);
                this.scrollToBottom();
        }
    }

    showHelp() {
        const helpMessages = [
            'Available commands:',
            'clear - Clear the terminal',
            'help - Show this help message',
            'exit - Exit the terminal',
            'ls [dir] - List directory contents',
            'cd <dir> - Change directory',
            'cat <file> - Display file contents',
            'model <name> - Set AI model',
            'mode - Toggle between streaming and non-streaming response modes',
            'temp <value> - Set AI temperature (0-1)',
            'echo <message> - Display a message',
            'date - Show current date and time',
            'whoami - Display current user',
            'pwd - Print working directory',
            'tree [dir] - Display directory structure',
            'Any other input will be sent to the AI for processing.'
        ];
        helpMessages.forEach(msg => this.printSystemMessage(msg));
    }

    toggleResponseMode() {
        this.useStreaming = !this.useStreaming;
        this.printSystemMessage(`Response mode set to: ${this.useStreaming ? 'streaming' : 'non-streaming'}`);
    }    

    listDirectory(dir) {
        const targetDir = dir ? this.getDirectoryFromPath(dir) : this.getCurrentDirectory();
        if (!targetDir) {
            this.printSystemMessage(`ls: cannot access '${dir}': No such file or directory`);
            return;
        }
        const contents = Object.keys(targetDir);
        if (contents.length === 0) {
            this.printSystemMessage('Directory is empty.');
        } else {
            contents.forEach(item => {
                const isDirectory = typeof targetDir[item] === 'object';
                this.printSystemMessage(`${isDirectory ? 'd' : '-'} ${item}`);
            });
        }
    }

    getDirectoryFromPath(path) {
        const parts = path.split('/').filter(p => p);
        let current = this.fileSystem;
        for (const part of parts) {
            if (part === '..') {
                current = this.getParentDirectory(current);
            } else if (current[part] && typeof current[part] === 'object') {
                current = current[part];
            } else {
                return null;
            }
        }
        return current;
    }

    getParentDirectory(dir) {
        const path = this.findPathToDirectory(dir);
        if (path.length > 1) {
            path.pop();
            return this.getDirectoryFromPath(path.join('/'));
        }
        return this.fileSystem;
    }

    findPathToDirectory(targetDir, currentPath = [], currentDir = this.fileSystem) {
        if (currentDir === targetDir) {
            return currentPath;
        }
        for (const [name, content] of Object.entries(currentDir)) {
            if (typeof content === 'object') {
                const path = this.findPathToDirectory(targetDir, [...currentPath, name], content);
                if (path) {
                    return path;
                }
            }
        }
        return null;
    }

    changeDirectory(dir) {
        if (!dir) {
            this.currentDirectory = ['/','home','user'];
        } else if (dir === '..') {
            if (this.currentDirectory.length > 1) {
                this.currentDirectory.pop();
            }
        } else {
            const parts = dir.split('/').filter(p => p);
            let current = this.getCurrentDirectory();
            for (const part of parts) {
                if (part === '..') {
                    if (this.currentDirectory.length > 1) {
                        this.currentDirectory.pop();
                        current = this.getCurrentDirectory();
                    }
                } else if (current[part] && typeof current[part] === 'object') {
                    this.currentDirectory.push(part);
                    current = current[part];
                } else {
                    this.printSystemMessage(`cd: ${part}: No such directory`);
                    return;
                }
            }
        }
        this.updatePrompt();
    }

    echo(message) {
        this.printSystemMessage(message);
    }

    showDate() {
        const now = new Date();
        this.printSystemMessage(now.toString());
    }

    showWhoami() {
        this.printSystemMessage('user');
    }

    showPwd() {
        this.printSystemMessage('/' + this.currentDirectory.join('/'));
    }

    showTree(dir = '') {
        const targetDir = dir ? this.getDirectoryFromPath(dir) : this.getCurrentDirectory();
        if (!targetDir) {
            this.printSystemMessage(`tree: cannot access '${dir}': No such file or directory`);
            return;
        }
        this.printSystemMessage(this.generateTree(targetDir));
    }

    generateTree(dir, prefix = '') {
        let result = '';
        const entries = Object.entries(dir);
        entries.forEach(([name, content], index) => {
            const isLast = index === entries.length - 1;
            const marker = isLast ? '└── ' : '├── ';
            result += prefix + marker + name + '\n';
            if (typeof content === 'object') {
                const newPrefix = prefix + (isLast ? '    ' : '│   ');
                result += this.generateTree(content, newPrefix);
            }
        });
        return result;
    }

    catFile(filename) {
        const currentDir = this.getCurrentDirectory();
        if (currentDir[filename] && typeof currentDir[filename] === 'string') {
            this.printSystemMessage(currentDir[filename]);
        } else {
            this.printSystemMessage(`cat: ${filename}: No such file`);
        }
    }

    getCurrentDirectory() {
        return this.currentDirectory.reduce((acc, curr) => acc[curr], this.fileSystem);
    }

    setAIModel(model) {
        if (model) {
            this.aiModel = model;
            this.printSystemMessage(`AI model set to: ${model}`);
        } else {
            this.printSystemMessage(`Current AI model: ${this.aiModel}`);
        }
    }

    setAITemperature(temp) {
        if (temp) {
            const temperature = parseFloat(temp);
            if (!isNaN(temperature) && temperature >= 0 && temperature <= 1) {
                this.aiTemperature = temperature;
                this.printSystemMessage(`AI temperature set to: ${temperature}`);
            } else {
                this.printSystemMessage('Invalid temperature. Please use a value between 0 and 1.');
            }
        } else {
            this.printSystemMessage(`Current AI temperature: ${this.aiTemperature}`);
        }
    }

    navigateHistory(direction) {
        this.historyIndex += direction;
        if (this.historyIndex < -1) this.historyIndex = -1;
        if (this.historyIndex >= this.commandHistory.length) this.historyIndex = this.commandHistory.length - 1;

        if (this.historyIndex === -1) {
            this.terminalInput.value = '';
        } else {
            this.terminalInput.value = this.commandHistory[this.historyIndex];
        }
    }

    autocomplete() {
        const input = this.terminalInput.value.toLowerCase();
        const commands = ['clear', 'help', 'exit', 'ls', 'cd', 'cat', 'model', 'temp'];
        const matches = commands.filter(cmd => cmd.startsWith(input));

        if (matches.length === 1) {
            this.terminalInput.value = matches[0];
        } else if (matches.length > 1) {
            this.printSystemMessage('Possible completions: ' + matches.join(' '));
        }
    }

    async sendMessageToAI(message) {
        this.isAIResponding = true;
        this.terminalInput.disabled = true;
        this.chatHistory.push({ role: 'user', content: message });
        this.printSystemMessage('AI is thinking...');
    
        try {
            const response = await fetch('/v1/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    model: this.aiModel,
                    messages: this.chatHistory,
                    temperature: this.aiTemperature,
                    stream: this.useStreaming,
                }),
            });
    
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
    
            if (this.useStreaming) {
                await this.handleStreamingResponse(response);
            } else {
                await this.handleNonStreamingResponse(response);
            }
    
        } catch (error) {
            console.error('Error:', error);
            this.printSystemMessage(`Error communicating with AI: ${error.message}`);
            if (error.message.includes('HTTP error!')) {
                this.printSystemMessage('The server might be down or experiencing issues. Please try again later.');
            } else {
                this.printSystemMessage('There was a problem processing your request. Please check your internet connection and try again.');
            }
        } finally {
            this.isAIResponding = false;
            this.terminalInput.disabled = false;
            this.focusInput();
        }
    }  

    async handleStreamingResponse(response) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let aiResponse = '';
        let aiOutputElement = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            
            for (const line of lines) {
                if (line.startsWith('data: ')) {
                    const content = line.slice(5).trim();
                    if (content === '[DONE]') {
                        console.log('Stream completed');
                        continue;
                    }
                    try {
                        const data = JSON.parse(content);
                        if (data.choices && data.choices[0].delta && data.choices[0].delta.content) {
                            const newContent = data.choices[0].delta.content;
                            aiResponse += newContent;
                            if (!aiOutputElement) {
                                aiOutputElement = document.createElement('div');
                                aiOutputElement.classList.add('ai-output');
                                this.terminalOutput.appendChild(aiOutputElement);
                            }
                            aiOutputElement.textContent += newContent;
                            this.scrollToBottom();
                        }
                    } catch (error) {
                        console.error('Error parsing JSON:', error, 'Content:', content);
                        this.printSystemMessage(`Error parsing AI response: ${error.message}`);
                    }
                }
            }
        }

        this.chatHistory.push({ role: 'assistant', content: aiResponse });
    }

    async handleNonStreamingResponse(response) {
        const data = await response.json();
        if (data.choices && data.choices[0].message) {
            const aiResponse = data.choices[0].message.content;
            this.printAIOutput(aiResponse);
            this.chatHistory.push({ role: 'assistant', content: aiResponse });
        } else {
            throw new Error('Unexpected response format');
        }
    }
}


const terminal = new AITerminal();

terminal.terminalInput.addEventListener('input', () => {
    terminal.updateCursorPosition();
});

window.addEventListener('resize', () => {
    terminal.updateCursorPosition();
});