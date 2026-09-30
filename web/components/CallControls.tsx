"use client";
export default function CallControls({ micOn, onToggleMic, onEnd, ending }: {
  micOn: boolean; onToggleMic: () => void; onEnd: () => void; ending: boolean;
}) {
  return (
    <div className="controls">
      <button className="btn ghost" onClick={onToggleMic} aria-pressed={!micOn}>{micOn ? "Mute microphone" : "Unmute microphone"}</button>
      <button className="btn danger" onClick={onEnd} disabled={ending}>{ending ? "Ending…" : "End call"}</button>
    </div>
  );
}
