import { build } from "esbuild";
import { cpSync, mkdirSync, readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const define = {
  __APP_VERSION__: JSON.stringify(pkg.version),
  __DEFAULT_CONVEX_URL__: JSON.stringify(process.env.ALARM_MCP_CONVEX_URL ?? "https://clever-quail-199.convex.cloud"),
  __WEB_ORIGIN__: JSON.stringify(process.env.ALARM_MCP_WEB_ORIGIN ?? "https://alarm-mcp.techlitnow.com"),
};

mkdirSync("dist", { recursive: true });

await Promise.all([
  build({
    entryPoints: { main: "src/main/index.ts", preload: "src/preload/index.ts" },
    outdir: "dist",
    bundle: true,
    platform: "node",
    format: "cjs",
    target: "node22",
    external: ["electron"],
    define,
    sourcemap: true,
  }),
  build({
    entryPoints: { app: "src/renderer/app.ts", alarm: "src/renderer/alarm.ts" },
    outdir: "dist",
    bundle: true,
    platform: "browser",
    format: "iife",
    target: "chrome130",
    define,
    sourcemap: true,
  }),
]);

for (const file of ["app.html", "alarm.html", "styles.css"]) {
  cpSync(`src/renderer/${file}`, `dist/${file}`);
}
console.log("Built desktop app into dist/");
