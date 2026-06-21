import { ChatAppShell } from "@/components/chat-app-shell";

export default function Home() {
  const debug = process.env.DEBUG?.toLowerCase() === "true";

  return <ChatAppShell debug={debug} />;
}
