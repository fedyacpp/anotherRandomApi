class ChatCompletion {
  constructor(id, model, choices, usage) {
    this.id = id;
    this.object = "chat.completion";
    this.created = Math.floor(Date.now() / 1000);
    this.model = model;
    this.choices = choices.map(choice => ({
      index: choice.index,
      message: {
        role: "assistant",
        content: choice.message.content
      },
      finish_reason: choice.finish_reason
    }));
    this.usage = usage || {
      prompt_tokens: -1,
      completion_tokens: -1,
      total_tokens: -1
    };
  }
}

module.exports = ChatCompletion;