import Brand from "@/components/Brand";
import JoinForm from "@/components/JoinForm";
import CallHistory from "@/components/CallHistory";

export default function Home() {
  return (
    <main className="wrap">
      <Brand />
      <header className="hero">
        <h1>Each of you speaks your language. Each of you hears your own.</h1>
        <p>Set up a call between two people. Everything said is interpreted into the other person's language after each sentence, with a written transcript alongside.</p>
        <div className="scripts" aria-hidden="true"><span lang="hi">हिन्दी</span><span lang="te">తెలుగు</span><span>English</span></div>
      </header>
      <JoinForm />
      <CallHistory />
    </main>
  );
}
