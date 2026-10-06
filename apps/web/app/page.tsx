import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";

export default function Home() {
  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <nav className="flex items-center justify-between">
        <span className="text-lg font-semibold tracking-tight">Alarm MCP</span>
        <div className="flex items-center gap-3">
          <Link href="/download" className="text-sm text-zinc-400 hover:text-glow">
            Download
          </Link>
          <Show
            when="signed-in"
            fallback={
              <SignInButton mode="modal">
                <button className="rounded-full border border-line px-4 py-1.5 text-sm hover:border-glow">Sign in</button>
              </SignInButton>
            }
          >
            <Link href="/dashboard" className="rounded-full bg-glow px-4 py-1.5 text-sm font-medium text-ink">
              Dashboard
            </Link>
          </Show>
        </div>
      </nav>

      <h1 className="mt-20 text-4xl font-semibold tracking-tight sm:text-5xl">
        An agent rings your phone or computer. You answer. It continues.
      </h1>
      <ol className="mt-10 list-decimal space-y-3 pl-5 text-zinc-300">
        <li>Sign up with email.</li>
        <li>
          <Link href="/download" className="text-glow underline-offset-2 hover:underline">
            Download
          </Link>{" "}
          and pair this device (desktop and/or Android).
        </li>
        <li>
          Give an agent this site, or <code className="text-glow">https://alarm-mcp.techlitnow.com/mcp</code>.
        </li>
      </ol>
      <p className="mt-6 text-zinc-400">
        Then: “Wake me when you’re done.” Approve, Deny, or Dismiss on the device goes back to the agent.
      </p>
      <div className="mt-10 flex flex-wrap gap-3">
        <Show
          when="signed-in"
          fallback={
            <SignUpButton mode="modal">
              <button className="rounded-full bg-glow px-6 py-3 font-medium text-ink">Sign up with email</button>
            </SignUpButton>
          }
        >
          <Link href="/dashboard" className="rounded-full bg-glow px-6 py-3 font-medium text-ink">
            Pair a device
          </Link>
        </Show>
        <Link href="/download" className="rounded-full border border-line px-6 py-3 font-medium hover:border-glow">
          Download apps
        </Link>
      </div>
      <p className="mt-16 text-sm text-zinc-500">
        Agents: start at{" "}
        <a className="text-glow underline-offset-2 hover:underline" href="/llms.txt">
          /llms.txt
        </a>
        . Humans building the apps:{" "}
        <a className="text-glow underline-offset-2 hover:underline" href="/setup.md">
          /setup.md
        </a>
        .
      </p>
    </main>
  );
}
