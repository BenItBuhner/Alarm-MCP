import { Show, SignInButton } from "@clerk/nextjs";
import Link from "next/link";

const steps = [
  {
    title: "Pair your devices",
    body: "Install the Android or desktop app and pair it with a one-time code from your dashboard.",
  },
  {
    title: "Connect your agent",
    body: "Add the hosted MCP endpoint to Claude, Cursor, Codex or any MCP client. Sign in once with OAuth.",
  },
  {
    title: "Go to sleep",
    body: "“Wake me when the training run finishes. Softly, unless it failed.” Your agent handles the rest.",
  },
];

const intensities = [
  { name: "Gentle", color: "text-sky-300", body: "Notification and a quiet chime. Good for blocked-on-permission nudges." },
  { name: "Normal", color: "text-amber-300", body: "Alarm screen with a ringtone at alarm volume until you respond." },
  { name: "Urgent", color: "text-rose-400", body: "Fullscreen over the lock screen, max volume, vibration, repeats." },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-5xl px-6 py-16">
      <nav className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">⏰ Alarm MCP</span>
        <Show
          when="signed-in"
          fallback={
            <SignInButton mode="modal">
              <button className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-glow">
                Sign in
              </button>
            </SignInButton>
          }
        >
          <Link href="/dashboard" className="rounded-full bg-glow px-4 py-1.5 text-sm font-medium text-ink">
            Dashboard
          </Link>
        </Show>
      </nav>

      <section className="mt-24 max-w-3xl">
        <p className="text-sm uppercase tracking-[0.2em] text-glow">An alarm with MCP</p>
        <h1 className="mt-4 text-5xl font-semibold leading-tight tracking-tight sm:text-6xl">
          Going to sleep while an agent is running? Tell it to wake you up when it&apos;s done.
        </h1>
        <p className="mt-6 text-lg text-zinc-400">
          Alarm MCP gives any AI agent a real alarm clock on your phone and computer. Describe what you want in plain
          language: when, how loud, which device, what to ask you. The agent sets it up and waits for your answer.
        </p>
        <div className="mt-10 flex gap-3">
          <Show
            when="signed-in"
            fallback={
              <SignInButton mode="modal">
                <button className="rounded-full bg-glow px-6 py-3 font-medium text-ink">Get started</button>
              </SignInButton>
            }
          >
            <Link href="/dashboard" className="rounded-full bg-glow px-6 py-3 font-medium text-ink">
              Open dashboard
            </Link>
          </Show>
        </div>
      </section>

      <section className="mt-24 grid gap-4 sm:grid-cols-3">
        {steps.map((step, i) => (
          <div key={step.title} className="rounded-2xl border border-line bg-panel/70 p-6">
            <div className="text-sm text-zinc-500">0{i + 1}</div>
            <h2 className="mt-2 text-lg font-medium">{step.title}</h2>
            <p className="mt-2 text-sm text-zinc-400">{step.body}</p>
          </div>
        ))}
      </section>

      <section className="mt-16 rounded-2xl border border-line bg-panel/70 p-8">
        <h2 className="text-xl font-medium">Three ways to wake you</h2>
        <div className="mt-6 grid gap-6 sm:grid-cols-3">
          {intensities.map((level) => (
            <div key={level.name}>
              <div className={`font-medium ${level.color}`}>{level.name}</div>
              <p className="mt-1 text-sm text-zinc-400">{level.body}</p>
            </div>
          ))}
        </div>
        <p className="mt-6 text-sm text-zinc-500">
          Alarms can escalate from gentle to urgent, spread to every device, read the message aloud, and show answer
          buttons like “Approve / Deny” that go straight back to your agent.
        </p>
      </section>
    </main>
  );
}
