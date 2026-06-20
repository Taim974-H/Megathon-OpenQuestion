"use client";

import dynamic from "next/dynamic";

const VoiceCube = dynamic(
  () => import("@/components/voice-cube").then((mod) => mod.VoiceCube),
  { ssr: false },
);

export default function CubePage() {
  return (
    <main className="grain h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <VoiceCube />
    </main>
  );
}
