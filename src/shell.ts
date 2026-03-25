import { spawn } from "node:child_process";

const HEARTBEAT_MS = 30_000;

/** Executa o comando no shell local; durante execuções longas, avisa em stderr periodicamente. */
export function runCommand(command: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: "inherit"
    });

    const interval = setInterval(() => {
      process.stderr.write("\n[Kronos] Comando ainda em execução…\n");
    }, HEARTBEAT_MS);

    const done = (fn: () => void) => {
      clearInterval(interval);
      fn();
    };

    child.on("error", (err) => done(() => reject(err)));
    child.on("close", (code) => done(() => resolve(code ?? 0)));
  });
}
