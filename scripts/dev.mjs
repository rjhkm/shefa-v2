import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

const isWindows = process.platform === "win32";
const python = isWindows ? join(".venv", "Scripts", "python.exe") : join(".venv", "bin", "python");
const vite = join("node_modules", "vite", "bin", "vite.js");

if (!existsSync(python)) {
  console.error("Python environment not found. Create it with: python -m venv .venv");
  process.exit(1);
}
if (!existsSync(vite)) {
  console.error("Frontend dependencies not found. Install them with: npm install");
  process.exit(1);
}

const children = [
  spawn(python, ["-m", "uvicorn", "backend.app.main:app", "--reload", "--host", "127.0.0.1", "--port", "8000"], { stdio: "inherit" }),
  spawn(process.execPath, [vite, "--host", "127.0.0.1"], { stdio: "inherit" }),
];

let stopping = false;
function stop(exitCode = 0) {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill();
  process.exit(exitCode);
}

process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
for (const child of children) {
  child.on("error", (error) => {
    console.error(`Could not start development server: ${error.message}`);
    stop(1);
  });
  child.on("exit", (code) => {
    if (!stopping && code !== 0) stop(code ?? 1);
  });
}
