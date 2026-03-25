import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { getKronosConfigDir } from "./config.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export interface DistroInfo {
  id?: string;
  versionId?: string;
  prettyName?: string;
}

export interface HostContext {
  platform: NodeJS.Platform;
  release: string;
  arch: string;
  hostname: string;
  /** Kernel / build extra (ex.: Windows: output de os.version()) */
  versionDetail?: string;
  distro?: DistroInfo;
  firstCapturedAt: string;
  lastDiscoverAt: string;
}

function hostFilePath(): string {
  return path.join(getKronosConfigDir(), "host.json");
}

function ensureDir(): void {
  const dir = getKronosConfigDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function parseOsRelease(raw: string): DistroInfo {
  const lines = raw.split(/\r?\n/);
  const map: Record<string, string> = {};
  for (const line of lines) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2] ?? "";
    if (v.startsWith('"') && v.endsWith('"')) {
      v = v.slice(1, -1).replace(/\\"/g, '"');
    }
    map[m[1]] = v;
  }
  return {
    id: map.ID,
    versionId: map.VERSION_ID,
    prettyName: map.PRETTY_NAME
  };
}

function readLinuxDistro(): DistroInfo | undefined {
  if (process.platform !== "linux") return undefined;
  try {
    const raw = fs.readFileSync("/etc/os-release", "utf8");
    const d = parseOsRelease(raw);
    if (d.id || d.prettyName) return d;
  } catch {
    // ignore
  }
  return undefined;
}

function discoverHost(): Omit<HostContext, "firstCapturedAt" | "lastDiscoverAt"> {
  const distro = readLinuxDistro();
  let versionDetail: string | undefined;
  if (typeof os.version === "function") {
    try {
      versionDetail = os.version();
    } catch {
      // ignore
    }
  }

  return {
    platform: process.platform,
    release: os.release(),
    arch: os.arch(),
    hostname: os.hostname(),
    ...(versionDetail ? { versionDetail } : {}),
    ...(distro ? { distro } : {})
  };
}

function readStored(): HostContext | null {
  const p = hostFilePath();
  if (!fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, "utf8");
    return JSON.parse(raw) as HostContext;
  } catch {
    return null;
  }
}

function writeStored(ctx: HostContext): void {
  ensureDir();
  fs.writeFileSync(hostFilePath(), JSON.stringify(ctx, null, 2), "utf8");
}

function needsDailyRefresh(lastDiscoverAt: string): boolean {
  const t = Date.parse(lastDiscoverAt);
  if (Number.isNaN(t)) return true;
  return Date.now() - t >= DAY_MS;
}

/**
 * Garante contexto do host salvo em ~/.kronos/host.json.
 * Na primeira chamada grava descoberta; depois, renova no máximo 1x por dia (24h).
 */
export function ensureHostContextForActions(): HostContext {
  const nowIso = new Date().toISOString();
  const stored = readStored();

  if (!stored) {
    const d = discoverHost();
    const ctx: HostContext = {
      ...d,
      firstCapturedAt: nowIso,
      lastDiscoverAt: nowIso
    };
    writeStored(ctx);
    return ctx;
  }

  if (needsDailyRefresh(stored.lastDiscoverAt)) {
    const d = discoverHost();
    const ctx: HostContext = {
      ...d,
      firstCapturedAt: stored.firstCapturedAt,
      lastDiscoverAt: nowIso
    };
    writeStored(ctx);
    return ctx;
  }

  return stored;
}

/** Texto curto para system prompt da IA (comandos corretos por SO). */
export function formatHostSummaryForPrompt(ctx: HostContext): string {
  const parts: string[] = [
    `platform=${ctx.platform}`,
    `kernel/release=${ctx.release}`,
    `arch=${ctx.arch}`,
    `hostname=${ctx.hostname}`
  ];
  if (ctx.versionDetail) {
    parts.push(`os.version=${ctx.versionDetail}`);
  }
  if (ctx.distro?.prettyName) {
    parts.push(`distro=${ctx.distro.prettyName}`);
  } else if (ctx.distro?.id) {
    parts.push(`distro_id=${ctx.distro.id}`);
    if (ctx.distro.versionId) parts.push(`distro_version=${ctx.distro.versionId}`);
  }
  return parts.join("; ");
}
