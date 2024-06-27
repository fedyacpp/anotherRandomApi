const ProviderInterface = require('./ProviderInterface');

class Provider1 extends ProviderInterface {
  constructor() {
    super();
    this.modelInfo = {
      modelId: "model1",
      name: "Model 1",
      description: "Description for Model 1",
      context_window: 4000,
      author: "Author 1",
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

module.exports = Provider1;