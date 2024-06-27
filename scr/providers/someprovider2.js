const ProviderInterface = require('./ProviderInterface');

class Provider2 extends ProviderInterface {
  constructor() {
    super();
    this.modelInfo = {
      modelId: "model2",
      name: "Model 2",
      description: "Description for Model 2",
      context_window: 4000,
      author: "Author 2",
      unfiltered: false,
      reverseStatus: "Stable",
      devNotes: "Internal notes for developers"
    };
  }

  async generateCompletion(messages, temperature) {
    const content = messages + " " + temperature;
    return { content: content };
  }
}

module.exports = Provider2;