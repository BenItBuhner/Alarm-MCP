import type { AppState } from "../shared/bridge";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const bridge = window.alarmMcp;
let prefilled = false;

function render(state: AppState): void {
  $("status").textContent = state.status;
  $("dot").className = `dot ${state.status}`;
  $("unpaired").classList.toggle("hidden", state.status !== "unpaired");
  $("paired").classList.toggle("hidden", state.status === "unpaired");
  $("version").textContent = `v${state.version}`;
  if (!prefilled) {
    $<HTMLInputElement>("url").value = state.convexUrl;
    prefilled = true;
  }
  $("device-name").textContent = state.deviceName ?? "";
  $("user-name").textContent = state.userName ? `Account: ${state.userName}` : "";
  $<HTMLInputElement>("login").checked = state.launchAtLogin;
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

$("pair-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $<HTMLButtonElement>("pair-button");
  const error = $("pair-error");
  button.disabled = true;
  error.classList.add("hidden");
  const result = await bridge.pair({
    code: $<HTMLInputElement>("code").value,
    name: $<HTMLInputElement>("name").value,
    convexUrl: $<HTMLInputElement>("url").value,
  });
  button.disabled = false;
  if (!result.ok) {
    error.textContent = result.error;
    error.classList.remove("hidden");
  }
});

$("unpair").addEventListener("click", () => void bridge.unpair());
$<HTMLInputElement>("login").addEventListener("change", (e) =>
  void bridge.setLaunchAtLogin((e.target as HTMLInputElement).checked),
);
document.querySelectorAll<HTMLButtonElement>("[data-test]").forEach((button) => {
  button.addEventListener("click", () => {
    const intensity = button.dataset.test;
    if (intensity === "gentle" || intensity === "normal" || intensity === "urgent") {
      void bridge.testAlarm(intensity);
    }
  });
});

bridge.onState(render);
void bridge.getState().then(render);
