"use client";

import dynamic from "next/dynamic";

const ChatApp = dynamic(
  () => import("@/components/chat-app").then((mod) => mod.ChatApp),
  { ssr: false },
);

export default function Home() {
  return <ChatApp />;
}
