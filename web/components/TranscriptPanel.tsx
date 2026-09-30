"use client";
import { useEffect, useRef } from "react";
import { langOf } from "@/lib/languages";

export type Turn = {
  id: string; speaker: string; sourceLanguage: string; sourceText: string;
  targetLanguage?: string; translatedText?: string; totalMs?: number; error?: string;
};

export default function TranscriptPanel({ turns, me, names, review = false }: {
  turns: Turn[]; me: string | null; names: Record<string, string>; review?: boolean;
}) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => { if (!review) end.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [turns, review]);

  if (turns.length === 0) {
    return <div className="empty">Nothing said yet. Start speaking and each sentence appears here, interpreted for the other person.</div>;
  }

  return (
    <div className="transcript" role="log" aria-live="polite" aria-label="Conversation transcript">
      {turns.map((t) => {
        const mine = t.speaker === me;
        const src = langOf(t.sourceLanguage), tgt = t.targetLanguage ? langOf(t.targetLanguage) : null;
        const who = mine ? "You" : names[t.speaker] ?? "Other";
        // Live: show what this person reads/hears first. Review: always original first.
        const showTranslationFirst = !review && !mine;
        const main = showTranslationFirst ? t.translatedText : t.sourceText;
        const mainLang = showTranslationFirst ? tgt : src;
        return (
          <article key={t.id} className={`turn ${mine || (review && t.speaker === "user-a") ? "mine" : "theirs"} ${t.error ? "err" : ""}`}>
            <div className="who">{who} · {src.english}</div>
            {t.error ? <p className="main">{t.error}</p> : main
              ? <p className="main" lang={mainLang?.tag}>{main}</p>
              : <p className="main pending">Interpreting…</p>}
            {!t.error && (
              <p className="sub">
                {showTranslationFirst
                  ? <><b>Original ({src.english}):</b> <span lang={src.tag}>{t.sourceText}</span></>
                  : t.translatedText
                    ? <><b>Interpreted ({tgt?.english}):</b> <span lang={tgt?.tag}>{t.translatedText}</span></>
                    : <span>Interpreting…</span>}
              </p>
            )}
            {t.totalMs ? <p className="latency">Interpreted in {(t.totalMs / 1000).toFixed(1)}s</p> : null}
          </article>
        );
      })}
      <div ref={end} />
    </div>
  );
}
