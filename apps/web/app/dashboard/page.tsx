"use client";

import { api } from "@alarm-mcp/backend/api";
import { isOnline, type AlarmView, type DeviceView, type Intensity } from "@alarm-mcp/backend/shared";
import { UserButton, useAuth } from "@clerk/nextjs";
import { useAction, useConvexAuth, useMutation, useQuery } from "convex/react";
import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  clearBrowserDevice,
  getInstallationId,
  loadBrowserDevice,
  saveBrowserDevice,
  webCapabilities,
} from "@/lib/browserDevice";
import { AlarmOverlay } from "../components/AlarmOverlay";
import { Shell } from "../components/Shell";

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
    <section className="rounded-2xl border border-line bg-panel p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="text-sm font-medium uppercase tracking-[0.16em] text-mute">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const field =
  "w-full rounded-xl border border-line bg-ink px-3 py-2.5 text-sm outline-none placeholder:text-mute/70 focus:border-glow";
const ghost = "rounded-full border border-line px-3 py-1.5 text-sm hover:border-glow disabled:opacity-40";
const primary = "rounded-full bg-glow px-3 py-1.5 text-sm font-medium text-ink disabled:opacity-40";

export default function Dashboard() {
  const { isLoaded: clerkLoaded } = useAuth();
  const { isAuthenticated } = useConvexAuth();
  const ensureUser = useMutation(api.users.ensure);

  useEffect(() => {
    if (!isAuthenticated) return;
    void ensureUser({}).catch(() => undefined);
  }, [isAuthenticated, ensureUser]);

  return (
    <Shell
      wide
      action={
        <>
          <Link href="/download" className="hover:text-paper">
            Download
          </Link>
          <UserButton />
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {!clerkLoaded && !isAuthenticated ? (
          <p className="text-sm text-mute">Connecting…</p>
        ) : null}
        <BrowserDevice />
        <Devices />
        <Connect />
        <Alarms />
      </div>
    </Shell>
  );
}

function BrowserDevice() {
  const register = useAction(api.devices.register);
  const respond = useMutation(api.deviceApi.respond);
  const heartbeat = useMutation(api.deviceApi.heartbeat);
  const signOutDevice = useMutation(api.deviceApi.signOut);
  const createAlarm = useMutation(api.alarms.create);
  const [saved, setSaved] = useState(() => (typeof window === "undefined" ? null : loadBrowserDevice()));
  const [name, setName] = useState("This browser");
  const [intensity, setIntensity] = useState<Intensity>("normal");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const feed = useQuery(api.deviceApi.feed, saved ? { deviceToken: saved.token } : "skip");
  const ringing = feed?.ringing[0];

  useEffect(() => {
    if (!saved) return;
    const beat = () =>
      void heartbeat({
        deviceToken: saved.token,
        appVersion: "web",
        capabilities: webCapabilities(),
      }).catch(() => undefined);
    beat();
    const id = setInterval(beat, 45_000);
    return () => clearInterval(id);
  }, [saved, heartbeat]);

  async function activate() {
    setBusy(true);
    setError(null);
    try {
      const result = await register({
        installationId: getInstallationId(),
        name: name.trim() || "This browser",
        platform: "web",
        capabilities: webCapabilities(),
        appVersion: "web",
        defaultIntensity: intensity,
      });
      saveBrowserDevice(result.deviceToken, name.trim() || "This browser", intensity);
      setSaved(loadBrowserDevice());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not register this browser");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (saved) await signOutDevice({ deviceToken: saved.token }).catch(() => undefined);
    clearBrowserDevice();
    setSaved(null);
  }

  return (
    <>
      <Card title="This browser">
        {saved ? (
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="font-medium">{saved.name}</p>
              <p className="mt-1 text-sm text-mute">Ready · default {saved.intensity}</p>
            </div>
            <div className="flex gap-2">
              <button
                className={ghost}
                onClick={() =>
                  void createAlarm({
                    title: "Agent finished",
                    message: "Approve to continue, or dismiss.",
                    trigger: { kind: "now" },
                    targets: { kind: "all" },
                    intensity: saved.intensity,
                    responseOptions: ["Approve", "Deny"],
                  })
                }
              >
                Ring now
              </button>
              <button className={ghost} onClick={() => void disable()}>
                Stop
              </button>
            </div>
          </div>
        ) : (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void activate();
            }}
          >
            <p className="text-sm text-mute">Name it, then it registers itself. Agents can ring this tab.</p>
            <input className={field} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} />
            <IntensityPicker value={intensity} onChange={setIntensity} />
            {error && <p className="text-sm text-rose-300">{error}</p>}
            <button className={`${primary} self-start`} disabled={busy}>
              {busy ? "Registering…" : "Use this browser"}
            </button>
          </form>
        )}
      </Card>
      {ringing && saved && (
        <AlarmOverlay
          alarm={ringing}
          onRespond={(action, option) => {
            void respond({
              deviceToken: saved.token,
              alarmId: ringing.alarmId,
              action,
              option,
              snoozeMinutes: action === "snooze" ? 5 : undefined,
            });
          }}
        />
      )}
    </>
  );
}

function IntensityPicker({ value, onChange }: { value: Intensity; onChange: (value: Intensity) => void }) {
  return (
    <div className="flex gap-2">
      {(["gentle", "normal", "urgent"] as const).map((level) => (
        <button
          key={level}
          type="button"
          onClick={() => onChange(level)}
          className={`rounded-full px-3 py-1.5 text-xs ${
            value === level ? "bg-glow text-ink" : "border border-line text-mute"
          }`}
        >
          {level}
        </button>
      ))}
    </div>
  );
}

function Devices() {
  const devices = useQuery(api.devices.list, {});
  const revoke = useMutation(api.devices.revoke);
  const now = useNow(5000);

  return (
    <Card title="Devices">
      {devices === undefined ? (
        <p className="text-sm text-mute">Loading…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-mute">
          None yet. Sign in on desktop or Android, or use this browser above.
        </p>
      ) : (
        <ul className="divide-y divide-line">
          {devices.map((device: DeviceView) => (
            <li key={device.id} className="flex items-center justify-between gap-3 py-3">
              <div className="flex min-w-0 items-center gap-2.5">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                    isOnline(device.lastSeenAt, now) ? "bg-emerald-400" : "bg-mute"
                  }`}
                />
                <span className="truncate font-medium">{device.name}</span>
                <span className="font-mono text-[11px] text-mute">{device.platform}</span>
              </div>
              <button
                className={ghost}
                onClick={() => {
                  if (confirm(`Remove ${device.name}?`)) void revoke({ deviceId: device.id });
                }}
              >
                Remove
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
    <Card title="Agent">
      <p className="font-mono text-sm text-glow">{url}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          className={primary}
          onClick={async () => {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? "Copied" : "Copy MCP URL"}
        </button>
        <a className={ghost} href="/setup.md">
          Snippets
        </a>
      </div>
      <p className="mt-3 text-xs text-mute">OAuth via Clerk. API key only if the client cannot do OAuth.</p>
      <form
        className="mt-4 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const result = await createKey({ name: keyName || "API key" });
          setCreated(result.key);
          setKeyName("");
        }}
      >
        <input className={field} placeholder="API key name" value={keyName} onChange={(e) => setKeyName(e.target.value)} />
        <button className={ghost}>Create</button>
      </form>
      {created && (
        <div className="mt-3 break-all rounded-xl border border-glow/40 bg-glow/5 p-3 font-mono text-xs text-glow">
          {created}
        </div>
      )}
      {(keys ?? []).length > 0 && (
        <ul className="mt-3 divide-y divide-line text-sm">
          {keys!.map((key) => (
            <li key={key.id} className="flex items-center justify-between py-2">
              <span>
                {key.name} <span className="font-mono text-xs text-mute">{key.prefix}…</span>
              </span>
              <button className={ghost} onClick={() => void revokeKey({ apiKeyId: key.id })}>
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
  scheduled: "text-indigo-300",
  ringing: "text-glow",
  acknowledged: "text-emerald-300",
  missed: "text-rose-300",
  cancelled: "text-mute",
};

function Alarms() {
  const alarms = useQuery(api.alarms.listRecent, { limit: 25 });
  const cancel = useMutation(api.alarms.cancel);
  const items = useMemo(() => alarms ?? [], [alarms]);

  return (
    <Card title="Alarms">
      {alarms === undefined ? (
        <p className="text-sm text-mute">Loading…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-mute">None yet. Ask an agent to wake you.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((alarm) => (
            <li key={alarm.id} className="rounded-xl border border-line px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`text-xs uppercase tracking-wider ${statusStyles[alarm.status]}`}>
                      {alarm.status}
                    </span>
                    <span className="font-medium">{alarm.title}</span>
                  </div>
                  {alarm.message && <p className="mt-1 text-sm text-mute">{alarm.message}</p>}
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
                  <button className={ghost} onClick={() => void cancel({ alarmId: alarm.id })}>
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
