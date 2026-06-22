"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";

const VoiceCube = dynamic(
  () => import("@/components/voice-cube").then((mod) => mod.VoiceCube),
  { ssr: false },
);

export function VoiceCubeShell({ debug = false }: { debug?: boolean }) {
  const searchParams = useSearchParams();

  return <VoiceCube debug={debug} threadId={searchParams.get("thread") ?? undefined} />;
}
