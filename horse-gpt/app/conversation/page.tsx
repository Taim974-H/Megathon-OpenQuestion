import { VoiceCubeShell } from "@/components/voice-cube-shell";

export default function ConversationPage() {
  const debug = process.env.DEBUG?.toLowerCase() === "true";

  return (
    <main className="grain h-screen overflow-hidden bg-[var(--background)] text-[var(--foreground)]">
      <VoiceCubeShell debug={debug} />
    </main>
  );
}
