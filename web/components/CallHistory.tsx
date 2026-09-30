"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { listCalls, type CallListItem } from "@/lib/api";

export default function CallHistory() {
  const [calls, setCalls] = useState<CallListItem[] | null>(null);
  useEffect(() => { listCalls().then(setCalls).catch(() => setCalls([])); }, []);
  if (!calls || calls.length === 0) return null;
  return (
    <section className="history" aria-labelledby="hist-h">
      <h2 id="hist-h">Past calls</h2>
      {calls.map((c) => (
        <Link key={c.callId} href={`/call/${c.callId}?review=1`} className="history-row">
          <span><b>{c.participants.join(" & ") || "Call"}</b><br /><span className="meta">{new Date(c.startedAt).toLocaleString()}</span></span>
          <span className="meta">{c.turns} {c.turns === 1 ? "turn" : "turns"} · {c.status}</span>
        </Link>
      ))}
    </section>
  );
}
