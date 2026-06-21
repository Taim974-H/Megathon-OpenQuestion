"use client";

import dynamic from "next/dynamic";

const ChatApp = dynamic(
  () => import("@/components/chat-app").then((mod) => mod.ChatApp),
  { ssr: false },
);

export function ChatAppShell({ debug = false }: { debug?: boolean }) {
  return <ChatApp debug={debug} />;
}
