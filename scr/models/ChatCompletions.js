class ChatCompletion {
    constructor(id, model, choices, usage) {
      this.id = id;
      this.object = "chat.completion";
      this.created = Math.floor(Date.now() / 1000);
      this.model = model;
      this.choices = choices;
      this.usage = usage;
    }
  }
  
  module.exports = ChatCompletion;