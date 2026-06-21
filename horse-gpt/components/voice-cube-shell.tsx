"use client";

import dynamic from "next/dynamic";

const VoiceCube = dynamic(
  () => import("@/components/voice-cube").then((mod) => mod.VoiceCube),
  { ssr: false },
);

export function VoiceCubeShell({ debug = false }: { debug?: boolean }) {
  return <VoiceCube debug={debug} />;
}
