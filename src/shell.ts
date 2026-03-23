import { spawn } from "node:child_process";

export function runCommand(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 0));
  });
}
