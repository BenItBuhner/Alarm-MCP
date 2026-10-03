"use client";

import { api } from "@alarm-mcp/backend/api";
import { formatPairingCode, isOnline, type AlarmView, type DeviceView } from "@alarm-mcp/backend/shared";
import { UserButton } from "@clerk/nextjs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";

function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-panel/80 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const button =
  "rounded-lg border border-line px-3 py-1.5 text-sm transition hover:border-glow disabled:cursor-not-allowed disabled:opacity-50";
const primaryButton = "rounded-lg bg-glow px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-50";
const input = "w-full rounded-lg border border-line bg-ink px-3 py-2 text-sm outline-none focus:border-glow";

export default function Dashboard() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensure);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureUser({}).then(() => setReady(true));
  }, [isAuthenticated, ensureUser]);

  return (
    <main className="mx-auto max-w-3xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          Alarm MCP
        </Link>
        <UserButton />
      </header>
      {isLoading || !ready ? (
        <p className="text-zinc-500">{isLoading || isAuthenticated ? "Loading…" : "Signing in…"}</p>
      ) : (
        <div className="flex flex-col gap-6">
          <Devices />
          <Connect />
          <Alarms />
        </div>
      )}
    </main>
  );
}

function Devices() {
  const devices = useQuery(api.devices.list, {});
  const createCode = useMutation(api.devices.createPairingCode);
  const revoke = useMutation(api.devices.revoke);
  const [pairing, setPairing] = useState<{ code: string; expiresAt: number } | null>(null);
  const now = useNow();
  const remaining = pairing ? Math.max(0, Math.round((pairing.expiresAt - now) / 1000)) : 0;

  return (
    <Card
      title="Pair this device"
      action={
        <button className={primaryButton} onClick={async () => setPairing(await createCode({}))}>
          Pair a device
        </button>
      }
    >
      {pairing && remaining > 0 && (
        <div className="mb-4 rounded-xl border border-glow/40 bg-glow/5 p-4">
          <p className="text-sm text-zinc-400">Enter this code in the Alarm MCP desktop or Android app:</p>
          <p className="mt-2 font-mono text-3xl tracking-[0.3em] text-glow">{formatPairingCode(pairing.code)}</p>
          <p className="mt-2 text-xs text-zinc-500">
            Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}
          </p>
        </div>
      )}
      {devices === undefined ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-zinc-500">
          No devices yet. Build the desktop app or Android APK from the repo (
          <a className="text-glow" href="/setup.md">
            setup.md
          </a>
          ), then pair with the code.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((device: DeviceView) => (
            <li key={device.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${isOnline(device.lastSeenAt, now) ? "bg-emerald-400" : "bg-zinc-600"}`}
                />
                <span className="font-medium">{device.name}</span>
                <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{device.platform}</span>
                <span className="text-xs text-zinc-500">{isOnline(device.lastSeenAt, now) ? "online" : "offline"}</span>
              </div>
              <button
                className={button}
                onClick={() => {
                  if (confirm(`Unpair ${device.name}?`)) void revoke({ deviceId: device.id });
                }}
              >
                Unpair
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Connect() {
  const [origin, setOrigin] = useState("");
  const [copied, setCopied] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [created, setCreated] = useState<string | null>(null);
  const keys = useQuery(api.apiKeys.list, {});
  const createKey = useAction(api.apiKeys.create);
  const revokeKey = useMutation(api.apiKeys.revoke);

  useEffect(() => setOrigin(window.location.origin), []);
  const url = origin ? `${origin}/mcp` : "https://alarm-mcp.techlitnow.com/mcp";

  return (
    <Card title="Give this to an agent">
      <p className="text-sm text-zinc-400">
        Site: <code className="text-glow">{origin || "https://alarm-mcp.techlitnow.com"}</code>
      </p>
      <p className="mt-2 text-sm text-zinc-400">
        MCP: <code className="text-glow">{url}</code>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          className={primaryButton}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy MCP URL"}
        </button>
        <a className={`${button} inline-block`} href="/setup.md">
          Install snippets
        </a>
      </div>
      <p className="mt-3 text-xs text-zinc-500">
        OAuth via Clerk. API key only if the client cannot do OAuth.
      </p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await createKey({ name: keyName || "API key" });
          setCreated(result.key);
          setKeyName("");
        }}
      >
        <input className={input} placeholder="API key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        <button className={button}>Create key</button>
      </form>
      {created && (
        <div className="mt-3 break-all rounded-lg border border-glow/40 bg-glow/5 p-3 font-mono text-xs text-glow">{created}</div>
      )}
      {(keys ?? []).length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {keys!.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-2">
              <span>
                {key.name} <span className="font-mono text-xs text-zinc-500">{key.prefix}…</span>
              </span>
              <button className={button} onClick={() => void revokeKey({ apiKeyId: key.id })}>
                Revoke
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

const statusStyles: Record<AlarmView["status"], string> = {
  scheduled: "bg-indigo-500/15 text-indigo-300",
  ringing: "bg-amber-500/15 text-amber-300 animate-pulse",
  acknowledged: "bg-emerald-500/15 text-emerald-300",
  missed: "bg-rose-500/15 text-rose-300",
  cancelled: "bg-zinc-700/40 text-zinc-400",
};

function Alarms() {
  const alarms = useQuery(api.alarms.listRecent, { limit: 25 });
  const cancel = useMutation(api.alarms.cancel);
  return (
    <Card title="Alarms">
      {alarms === undefined ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : alarms.length === 0 ? (
        <p className="text-sm text-zinc-500">None yet. Ask an agent to wake you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {alarms.map((alarm) => (
            <li key={alarm.id} className="rounded-xl border border-line p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${statusStyles[alarm.status]}`}>{alarm.status}</span>
                    <span className="font-medium">{alarm.title}</span>
                  </div>
                  {alarm.message && <p className="mt-1 text-sm text-zinc-400">{alarm.message}</p>}
                  {alarm.response && (
                    <p className="mt-1 text-xs text-emerald-300">
                      {alarm.response.action === "respond"
                        ? `Answered “${alarm.response.option}”`
                        : alarm.response.action === "snooze"
                          ? "Snoozed"
                          : "Dismissed"}{" "}
                      on {alarm.response.deviceName}
                    </p>
                  )}
                </div>
                {(alarm.status === "scheduled" || alarm.status === "ringing") && (
                  <button className={button} onClick={() => void cancel({ alarmId: alarm.id })}>
                    {alarm.status === "ringing" ? "Silence" : "Cancel"}
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
