import { Show, SignInButton, SignUpButton } from "@clerk/nextjs";
import Link from "next/link";
import { Shell } from "./components/Shell";

export default function Home() {
  return (
    <Shell
      action={
        <>
          <Link href="/download" className="hover:text-paper">
            Download
          </Link>
          <Show
            when="signed-in"
            fallback={
              <SignInButton mode="modal">
                <button className="hover:text-paper">Sign in</button>
              </SignInButton>
            }
          >
            <Link href="/dashboard" className="text-glow hover:text-paper">
              Dashboard
            </Link>
          </Show>
        </>
      }
    >
      <p className="text-xs font-medium uppercase tracking-[0.22em] text-mute">One loop</p>
      <h1 className="mt-4 text-[2.35rem] font-medium leading-[1.12] tracking-tight sm:text-5xl">
        Sign in. The device is ready. An agent rings it. You answer.
      </h1>
      <ol className="mt-10 space-y-4 text-[15px] leading-relaxed text-mute">
        <li>
          <span className="mr-3 font-mono text-xs text-glow">01</span>
          Sign in with email.
        </li>
        <li>
          <span className="mr-3 font-mono text-xs text-glow">02</span>
          Open this site, the desktop app, or Android. Name the device. It registers itself.
        </li>
        <li>
          <span className="mr-3 font-mono text-xs text-glow">03</span>
          Give an agent this site or <code className="text-paper">/mcp</code>.
        </li>
      </ol>
      <div className="mt-12 flex flex-wrap gap-3">
        <Show
          when="signed-in"
          fallback={
            <SignUpButton mode="modal">
              <button className="rounded-full bg-glow px-5 py-2.5 text-sm font-medium text-ink">
                Sign in with email
              </button>
            </SignUpButton>
          }
        >
          <Link href="/dashboard" className="rounded-full bg-glow px-5 py-2.5 text-sm font-medium text-ink">
            Open dashboard
          </Link>
        </Show>
        <Link
          href="/download"
          className="rounded-full border border-line px-5 py-2.5 text-sm text-paper hover:border-glow"
        >
          Desktop & Android
        </Link>
      </div>
      <p className="mt-20 text-sm text-mute">
        Agents:{" "}
        <a className="text-paper underline-offset-4 hover:underline" href="/llms.txt">
          /llms.txt
        </a>
      </p>
    </Shell>
  );
}
