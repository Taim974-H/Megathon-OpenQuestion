"use client";

import dynamic from "next/dynamic";

const VoiceCube = dynamic(
  () => import("@/components/voice-cube").then((mod) => mod.VoiceCube),
  { ssr: false },
);

export default function CubePage() {
  return (
    <main className="grain min-h-screen bg-[var(--background)] text-[var(--foreground)]">
      <VoiceCube />
    </main>
  );
}
