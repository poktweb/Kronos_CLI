import { spawn } from "node:child_process";

const HEARTBEAT_MS = 30_000;
const DEFAULT_CAPTURE_MAX_BYTES = 512 * 1024;
const DEFAULT_CAPTURE_TIMEOUT_MS = 120_000;

export interface RunCommandCaptureResult {
  code: number | null;
  stdout: string;
  stderr: string;
  timedOut?: boolean;
}

function appendCapped(
  acc: { buf: Buffer; len: number },
  chunk: Buffer,
  maxBytes: number
): void {
  const room = maxBytes - acc.len;
  if (room <= 0) return;
  const take = Math.min(chunk.length, room);
  if (take === 0) return;
  acc.buf = Buffer.concat([acc.buf, chunk.subarray(0, take)]);
  acc.len += take;
}

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

/**
 * Executa o comando e captura stdout/stderr (útil para integrar saída de ferramentas como nmap no chat).
 * Encerra o processo após timeoutMs e marca timedOut.
 */
export function runCommandCapture(
  command: string,
  opts?: { maxBytes?: number; timeoutMs?: number }
): Promise<RunCommandCaptureResult> {
  const maxBytes = opts?.maxBytes ?? DEFAULT_CAPTURE_MAX_BYTES;
  const timeoutMs = opts?.timeoutMs ?? DEFAULT_CAPTURE_TIMEOUT_MS;

  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      shell: true,
      stdio: ["ignore", "pipe", "pipe"]
    });

    const outAcc = { buf: Buffer.alloc(0), len: 0 };
    const errAcc = { buf: Buffer.alloc(0), len: 0 };

    child.stdout?.on("data", (chunk: Buffer) => appendCapped(outAcc, chunk, maxBytes));
    child.stderr?.on("data", (chunk: Buffer) => appendCapped(errAcc, chunk, maxBytes));

    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        child.kill("SIGTERM");
      } catch {
        // ignore
      }
      setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // ignore
        }
      }, 5_000);
    }, timeoutMs);

    const finish = (code: number | null) => {
      clearTimeout(timer);
      const stdout =
        outAcc.buf.toString("utf8") +
        (outAcc.len >= maxBytes ? "\n[Kronos] stdout truncado (limite de bytes).\n" : "");
      const stderr =
        errAcc.buf.toString("utf8") +
        (errAcc.len >= maxBytes ? "\n[Kronos] stderr truncado (limite de bytes).\n" : "");
      resolve({
        code,
        stdout,
        stderr,
        timedOut
      });
    };

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => finish(code));
  });
}
