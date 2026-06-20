export type ChatRole = "user" | "assistant";
export type ChatMode = "horse" | "unicorn";

export type ChatMessage = {
  role: ChatRole;
  content: string;
};

export type ChatThread = {
  id: string;
  title: string;
  starterLine: string;
  mode: ChatMode;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
};
