"use client";
import { useState } from "react";
import type { CallData } from "@/lib/api";

const TABS = [
  { key: "english", label: "English", tag: "en" },
  { key: "hindi", label: "हिन्दी", tag: "hi" },
  { key: "telugu", label: "తెలుగు", tag: "te" },
] as const;

const sec = (ms: number | null) => (ms == null ? "–" : `${(ms / 1000).toFixed(1)}s`);

export default function SummaryView({ call }: { call: CallData }) {
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("english");
  const text = call.summary[tab];
  const m = call.metrics;
  return (
    <div className="summary">
      <section className="panel" aria-labelledby="sum-h">
        <h3 id="sum-h">Call summary and action items</h3>
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.key} role="tab" aria-selected={tab === t.key} className="tile" aria-pressed={tab === t.key}
              onClick={() => setTab(t.key)} lang={t.tag} style={{ padding: "8px 14px" }}>{t.label}</button>
          ))}
        </div>
        {text ? <pre lang={TABS.find((t) => t.key === tab)!.tag}>{text}</pre>
          : <p className="hint">{tab === "english" ? "No summary was saved for this call." : "A translated summary isn't available for this call."}</p>}
      </section>
      <section className="panel" aria-labelledby="met-h">
        <h3 id="met-h">Speed</h3>
        <div className="metrics">
          <div className="metric"><div className="num">{m.turns}</div><div className="lab">Turns interpreted</div></div>
          <div className="metric"><div className="num">{sec(m.medianTranslationMs)}</div><div className="lab">Median translation</div></div>
          <div className="metric"><div className="num">{sec(m.medianTtsMs)}</div><div className="lab">Median speech generation</div></div>
          <div className="metric"><div className="num">{sec(m.medianTotalMs)}</div><div className="lab">Median translation + speech</div></div>
        </div>
      </section>
    </div>
  );
}
