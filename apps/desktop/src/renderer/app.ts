import type { Intensity } from "@alarm-mcp/backend/shared";
import type { AppState } from "../shared/bridge";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bridge = window.alarmMcp;

let intensity: Intensity = "normal";

function show(id: string, visible: boolean): void {
  $(id).classList.toggle("hidden", !visible);
}

function render(state: AppState): void {
  $("status").textContent = state.status.replace("_", " ");
  $("dot").className = `dot ${state.status}`;
  show("signed-out", state.status === "signed_out");
  show("setup", state.status === "needs_setup");
  show("ready", state.status === "connecting" || state.status === "connected" || state.status === "offline");

  if (state.status === "needs_setup" && !$<HTMLInputElement>("device-name-input").value) {
    $<HTMLInputElement>("device-name-input").value = state.deviceName || "";
  }
  intensity = state.defaultIntensity;
  for (const button of $("intensity").querySelectorAll("button")) {
    button.classList.toggle("on", button.getAttribute("data-intensity") === intensity);
  }

  $("device-name").textContent = state.deviceName ?? "";
  $("user-name").textContent = state.userName ? state.userName : "";
  const list = $("upcoming");
  list.replaceChildren(
    ...(state.upcoming.length === 0
      ? [Object.assign(document.createElement("li"), { textContent: "None scheduled" })]
      : state.upcoming.map((a) =>
          Object.assign(document.createElement("li"), {
            textContent: `${a.title} — ${new Date(a.fireAt).toLocaleString()}`,
          }),
        )),
  );
  const lastError = $("last-error");
  lastError.textContent = state.lastError ?? "";
  lastError.classList.toggle("hidden", !state.lastError);
}

$("email-button").addEventListener("click", async () => {
  const button = $<HTMLButtonElement>("email-button");
  const error = $("email-error");
  button.disabled = true;
  error.classList.add("hidden");
  const result = await bridge.clerkSignIn();
  button.disabled = false;
  if (!result.ok) {
    error.textContent = result.error;
    error.classList.remove("hidden");
  }
});

$("intensity").addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const value = target.getAttribute("data-intensity");
  if (value === "gentle" || value === "normal" || value === "urgent") {
    intensity = value;
    for (const button of $("intensity").querySelectorAll("button")) {
      button.classList.toggle("on", button === target);
    }
  }
});

$("setup-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("setup-button");
  const error = $("setup-error");
  button.disabled = true;
  error.classList.add("hidden");
  const result = await bridge.registerDevice({
    name: $<HTMLInputElement>("device-name-input").value,
    defaultIntensity: intensity,
  });
  button.disabled = false;
  if (!result.ok) {
    error.textContent = result.error;
    error.classList.remove("hidden");
  }
});

$("sign-out").addEventListener("click", () => void bridge.signOut());

const preview = new URLSearchParams(location.search).get("preview");
if (preview === "setup") {
  render({
    status: "needs_setup",
    version: "0.1.0",
    convexUrl: "",
    deviceName: "Studio PC",
    defaultIntensity: "normal",
    ringingCount: 0,
    upcoming: [],
    launchAtLogin: false,
  });
} else {
  bridge.onState(render);
  void bridge.getState().then(render);
}
