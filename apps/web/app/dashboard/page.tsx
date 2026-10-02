"use client";

import { api } from "@alarm-mcp/backend/api";
import {
  formatPairingCode,
  isOnline,
  type AlarmView,
  type DeviceView,
  type Intensity,
} from "@alarm-mcp/backend/shared";
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

function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/^.*?Uncaught Error:\s*/s, "").replace(/\s+at .*$/s, "");
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
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-lg font-semibold tracking-tight">
          ⏰ Alarm MCP
        </Link>
        <UserButton />
      </header>
      {isLoading || !ready ? (
        <p className="text-zinc-500">{isLoading || isAuthenticated ? "Loading…" : "Signing in…"}</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
          <div className="flex flex-col gap-6">
            <Devices />
            <Connect />
            <ApiKeys />
          </div>
          <div className="flex flex-col gap-6">
            <TestAlarm />
            <Alarms />
          </div>
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
      title="Devices"
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
            Expires in {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, "0")}. Server URL:{" "}
            <code className="text-zinc-300">{process.env.NEXT_PUBLIC_CONVEX_URL}</code>
          </p>
        </div>
      )}
      {devices === undefined ? (
        <p className="text-sm text-zinc-500">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-zinc-500">No devices yet. Pair your phone and computer so agents can reach you.</p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((device: DeviceView) => (
            <li key={device.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span
                    className={`h-2 w-2 rounded-full ${isOnline(device.lastSeenAt, now) ? "bg-emerald-400" : "bg-zinc-600"}`}
                  />
                  <span className="font-medium">{device.name}</span>
                  <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-xs text-zinc-400">{device.platform}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">
                  {isOnline(device.lastSeenAt, now) ? "Online" : `Last seen ${new Date(device.lastSeenAt).toLocaleString()}`}
                  {device.pushEnabled ? " · push wake on" : ""}
                  {device.appVersion ? ` · v${device.appVersion}` : ""}
                </p>
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
  useEffect(() => setOrigin(window.location.origin), []);
  const url = `${origin}/mcp`;
  const snippets = [
    { label: "Claude Code", code: `claude mcp add --transport http alarm ${url}` },
    { label: "Cursor / generic JSON", code: JSON.stringify({ mcpServers: { alarm: { url } } }, null, 2) },
    {
      label: "Clients without OAuth (API key)",
      code: JSON.stringify(
        { mcpServers: { alarm: { url, headers: { Authorization: "Bearer amk_your_key" } } } },
        null,
        2,
      ),
    },
  ];
  return (
    <Card title="Connect your agent">
      <p className="text-sm text-zinc-400">
        MCP endpoint (Streamable HTTP, OAuth via Clerk): <code className="text-glow">{url}</code>
      </p>
      <div className="mt-4 flex flex-col gap-3">
        {snippets.map((s) => (
          <div key={s.label}>
            <div className="mb-1 text-xs text-zinc-500">{s.label}</div>
            <pre className="overflow-x-auto rounded-lg border border-line bg-ink p-3 text-xs text-zinc-300">{s.code}</pre>
          </div>
        ))}
      </div>
      <p className="mt-4 text-xs text-zinc-500">
        Then just ask: “Wake me up on my phone when the deploy finishes. Gently, unless it fails.”
      </p>
    </Card>
  );
}

function ApiKeys() {
  const keys = useQuery(api.apiKeys.list, {});
  const create = useAction(api.apiKeys.create);
  const revoke = useMutation(api.apiKeys.revoke);
  const [name, setName] = useState("");
  const [created, setCreated] = useState<string | null>(null);

  return (
    <Card title="API keys">
      <p className="mb-3 text-sm text-zinc-400">For MCP clients that can&apos;t do OAuth. Keys are shown once.</p>
      <form
        className="flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await create({ name: name || "API key" });
          setCreated(result.key);
          setName("");
        }}
      >
        <input className={input} placeholder="Key name (e.g. Codex CLI)" value={name} onChange={(e) => setName(e.target.value)} />
        <button className={primaryButton}>Create</button>
      </form>
      {created && (
        <div className="mt-3 break-all rounded-lg border border-glow/40 bg-glow/5 p-3 font-mono text-xs text-glow">
          {created}
        </div>
      )}
      <ul className="mt-3 divide-y divide-line text-sm">
        {(keys ?? []).map((key) => (
          <li key={key.id} className="flex items-center justify-between py-2">
            <span>
              {key.name} <span className="font-mono text-xs text-zinc-500">{key.prefix}…</span>
            </span>
            <button className={button} onClick={() => void revoke({ apiKeyId: key.id })}>
              Revoke
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function TestAlarm() {
  const devices = useQuery(api.devices.list, {});
  const createAlarm = useMutation(api.alarms.create);
  const [title, setTitle] = useState("Test alarm");
  const [intensity, setIntensity] = useState<Intensity>("gentle");
  const [target, setTarget] = useState<string>("all");
  const [delay, setDelay] = useState(0);
  const [askQuestion, setAskQuestion] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card title="Send a test alarm">
      <form
        className="grid gap-3 sm:grid-cols-2"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          try {
            await createAlarm({
              title,
              message: askQuestion ? "Your agent needs a decision." : "Sent from the Alarm MCP dashboard.",
              trigger: delay > 0 ? { kind: "in", seconds: delay } : { kind: "now" },
              targets: target === "all" ? { kind: "all" } : { kind: "devices", selectors: [target] },
              intensity,
              responseOptions: askQuestion ? ["Approve", "Deny"] : undefined,
            });
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
      >
        <input className={`${input} sm:col-span-2`} value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className={input} value={intensity} onChange={(e) => setIntensity(e.target.value as Intensity)}>
          <option value="gentle">Gentle</option>
          <option value="normal">Normal</option>
          <option value="urgent">Urgent</option>
        </select>
        <select className={input} value={target} onChange={(e) => setTarget(e.target.value)}>
          <option value="all">All devices</option>
          {(devices ?? []).map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <select className={input} value={delay} onChange={(e) => setDelay(Number(e.target.value))}>
          <option value={0}>Ring now</option>
          <option value={10}>In 10 seconds</option>
          <option value={60}>In 1 minute</option>
          <option value={300}>In 5 minutes</option>
        </select>
        <label className="flex items-center gap-2 text-sm text-zinc-400">
          <input type="checkbox" checked={askQuestion} onChange={(e) => setAskQuestion(e.target.checked)} />
          Ask Approve / Deny
        </label>
        <button className={`${primaryButton} sm:col-span-2`} disabled={!devices || devices.length === 0}>
          Ring
        </button>
        {error && <p className="text-sm text-rose-400 sm:col-span-2">{error}</p>}
      </form>
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
        <p className="text-sm text-zinc-500">No alarms yet. Ask an agent to wake you, or send a test above.</p>
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
                  {alarm.objective && <p className="mt-1 text-xs italic text-zinc-500">“{alarm.objective}”</p>}
                  <p className="mt-2 text-xs text-zinc-500">
                    {alarm.currentIntensity} · {alarm.status === "scheduled" ? "fires" : "fired"}{" "}
                    {new Date(alarm.firedAt ?? alarm.fireAt).toLocaleString()} ·{" "}
                    {alarm.targetMode === "all" ? "all devices" : alarm.targetDeviceNames.join(", ")} · via{" "}
                    {alarm.source.kind}
                    {alarm.source.client ? ` (${alarm.source.client})` : ""}
                  </p>
                  {alarm.response && (
                    <p className="mt-1 text-xs text-emerald-300">
                      {alarm.response.action === "respond" ? `Answered “${alarm.response.option}”` : alarm.response.action === "snooze" ? "Snoozed" : "Dismissed"}{" "}
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
