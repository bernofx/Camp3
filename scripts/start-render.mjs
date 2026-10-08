import { mkdirSync } from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const dataRoot = process.env.RENDER_DISK_PATH || path.join(projectRoot, ".render-data");
const persistRoot = path.join(dataRoot, "wrangler");
const runtimeRoot = path.join(dataRoot, "runtime");
const port = process.env.PORT || "10000";

mkdirSync(persistRoot, { recursive: true });
mkdirSync(runtimeRoot, { recursive: true });

const child = spawn(process.execPath, [
  "--import", "./scripts/sites-env.mjs",
  "./node_modules/wrangler/bin/wrangler.js", "dev",
  "--config", "dist/server/wrangler.json",
  "--local", "--persist-to", persistRoot,
  "--ip", "0.0.0.0", "--port", port,
  "--inspector-port", "0",
], {
  cwd: projectRoot,
  env: { ...process.env, SITES_RUNTIME_ROOT: runtimeRoot, WRANGLER_SEND_METRICS: "false" },
  stdio: "inherit",
});

for (const signal of ["SIGTERM", "SIGINT"]) process.on(signal, () => child.kill(signal));
child.on("exit", code => process.exit(code ?? 1));
