"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createRoom, type Prefs } from "@/lib/api";
import { LANGUAGES, type LangCode } from "@/lib/languages";

function LangTiles({ label, value, onChange }: { label: string; value: LangCode; onChange: (c: LangCode) => void }) {
  return (
    <fieldset>
      <legend className="legend">{label}</legend>
      <div className="tiles">
        {LANGUAGES.map((l) => (
          <button key={l.code} type="button" className="tile" aria-pressed={value === l.code} onClick={() => onChange(l.code)}>
            <span lang={l.tag}>{l.native}</span>
            {l.native !== l.english && <small>{l.english}</small>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export default function JoinForm() {
  const router = useRouter();
  const [a, setA] = useState<Prefs>({ displayName: "", spokenLanguage: "hi-IN", listeningLanguage: "te-IN" });
  const [b, setB] = useState<Prefs>({ displayName: "", spokenLanguage: "te-IN", listeningLanguage: "hi-IN" });
  // Listening language follows the other person's spoken language until the user picks one themselves.
  const [touchedA, setTouchedA] = useState(false);
  const [touchedB, setTouchedB] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const setSpokenA = (c: LangCode) => { setA({ ...a, spokenLanguage: c }); if (!touchedB) setB((p) => ({ ...p, listeningLanguage: c })); };
  const setSpokenB = (c: LangCode) => { setB({ ...b, spokenLanguage: c }); if (!touchedA) setA((p) => ({ ...p, listeningLanguage: c })); };

  const valid = a.displayName.trim() && b.displayName.trim();

  async function start(e: React.FormEvent) {
    e.preventDefault();
    if (!valid) return;
    setBusy(true); setError("");
    try {
      const room = await createRoom({ ...a, displayName: a.displayName.trim() }, { ...b, displayName: b.displayName.trim() });
      router.push(`/call/${room.callId}?as=user-a&invite=1`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not create the call.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={start}>
      <div className="bridge">
        <section className="person you" aria-labelledby="you-h">
          <h2 id="you-h">You</h2>
          <label className="field"><span>Your name</span>
            <input className="text-input" value={a.displayName} maxLength={60} placeholder="Shiva" onChange={(e) => setA({ ...a, displayName: e.target.value })} />
          </label>
          <LangTiles label="I speak" value={a.spokenLanguage} onChange={setSpokenA} />
          <LangTiles label="I want to hear" value={a.listeningLanguage} onChange={(c) => { setTouchedA(true); setA({ ...a, listeningLanguage: c }); }} />
        </section>
        <div className="bridge-mid" aria-hidden="true" />
        <section className="person them" aria-labelledby="them-h">
          <h2 id="them-h">The person you're calling</h2>
          <label className="field"><span>Their name</span>
            <input className="text-input" value={b.displayName} maxLength={60} placeholder="Srishanth" onChange={(e) => setB({ ...b, displayName: e.target.value })} />
          </label>
          <LangTiles label="They speak" value={b.spokenLanguage} onChange={setSpokenB} />
          <LangTiles label="They want to hear" value={b.listeningLanguage} onChange={(c) => { setTouchedB(true); setB({ ...b, listeningLanguage: c }); }} />
        </section>
      </div>
      <div className="actions">
        <button className="btn" type="submit" disabled={!valid || busy}>{busy ? "Creating call…" : "Create call"}</button>
        <span className="hint">You'll get a link to send to {b.displayName.trim() || "them"}.</span>
      </div>
      {error && <p className="error" role="alert" style={{ marginTop: 12 }}>{error}</p>}
    </form>
  );
}
