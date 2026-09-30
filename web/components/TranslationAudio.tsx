"use client";
import { useEffect, useRef } from "react";
import type { RemoteAudioTrack } from "livekit-client";

/** Plays the one interpreter track meant for this listener. Nothing else is ever attached. */
export default function TranslationAudio({ track }: { track: RemoteAudioTrack | null }) {
  const ref = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || !track) return;
    track.attach(el);
    return () => { track.detach(el); };
  }, [track]);
  return <audio ref={ref} autoPlay aria-hidden="true" />;
}
