/**
 * MCP — paridade com Pokt_CLI (pokt_cli/mcp.json + config global em ~/.kronos).
 */
import fs from "node:fs";
import path from "node:path";
import { loadConfig } from "./config.js";
import type { KronosConfig } from "./types.js";
import type { McpServerConfig } from "./types.js";

const ACCEPT_DIR_NAMES_LOWER = new Set(["pokt_cli", "pot_cli"]);

export function isPoktCliDirName(name: string): boolean {
  return ACCEPT_DIR_NAMES_LOWER.has(name.trim().toLowerCase());
}

export function findPoktCliFolder(startDir: string): string | null {
  let dir = path.resolve(startDir);
  const root = path.parse(dir).root;
  while (true) {
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const ent of entries) {
        if (ent.isDirectory() && isPoktCliDirName(ent.name)) {
          return path.join(dir, ent.name);
        }
      }
    } catch {
      /* ignore */
    }
    if (dir === root) break;
    dir = path.dirname(dir);
  }
  return null;
}

function getServerEntriesMap(raw: Record<string, unknown>): Record<string, unknown> | null {
  if ("mcpServers" in raw && raw.mcpServers && typeof raw.mcpServers === "object") {
    return raw.mcpServers as Record<string, unknown>;
  }
  if ("servers" in raw && raw.servers && typeof raw.servers === "object") {
    return raw.servers as Record<string, unknown>;
  }
  return null;
}

function mcpJsonEntryToConfig(name: string, entry: Record<string, unknown>): McpServerConfig | null {
  const url = typeof entry.url === "string" ? entry.url.trim() : "";
  const command = typeof entry.command === "string" ? entry.command.trim() : "";
  const args = Array.isArray(entry.args) ? (entry.args as unknown[]).map((a) => String(a)) : [];
  const transportRaw = typeof entry.transport === "string" ? entry.transport.toLowerCase().trim() : "";
  const httpTransport: "streamable-http" | "sse" = transportRaw === "sse" ? "sse" : "streamable-http";
  const oauth = entry.oauth === true;
  if (url) {
    return { name, type: "http", url, httpTransport, oauth, source: "project" };
  }
  if (command) {
    return { name, type: "stdio", command, args, source: "project" };
  }
  return null;
}

export function loadProjectMcpJson(poktDir: string): {
  servers: McpServerConfig[];
  mcpJsonPath: string;
  poktDir: string;
} {
  const mcpJsonPath = path.join(poktDir, "mcp.json");
  if (!fs.existsSync(mcpJsonPath)) {
    return { servers: [], mcpJsonPath, poktDir };
  }
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(mcpJsonPath, "utf8"));
  } catch {
    return { servers: [], mcpJsonPath, poktDir };
  }
  const servers: McpServerConfig[] = [];
  if (raw && typeof raw === "object") {
    const ms = getServerEntriesMap(raw as Record<string, unknown>);
    if (ms) {
      for (const [name, entry] of Object.entries(ms)) {
        if (entry && typeof entry === "object") {
          const c = mcpJsonEntryToConfig(name, entry as Record<string, unknown>);
          if (c) servers.push(c);
        }
      }
    }
  }
  return { servers, mcpJsonPath, poktDir };
}

export function mergeMcpConfigs(
  globalServers: McpServerConfig[],
  projectServers: McpServerConfig[]
): McpServerConfig[] {
  const map = new Map<string, McpServerConfig>();
  for (const g of globalServers) {
    map.set(g.name, { ...g, source: g.source ?? "global" });
  }
  for (const p of projectServers) {
    map.set(p.name, { ...p, source: "project" });
  }
  return [...map.values()];
}

const MCP_JSON_TEMPLATE = `{
  "mcpServers": {
    "meu-servidor-local": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "."],
      "env": {}
    },
    "meu-servidor-http": {
      "url": "https://seu-host/mcp",
      "transport": "streamable-http",
      "oauth": true
    }
  }
}
`;

export function initProjectMcpJson(projectRootDir: string): {
  created: boolean;
  path: string;
  poktDir: string;
} {
  const poktDir = path.join(path.resolve(projectRootDir), "pokt_cli");
  const mcpPath = path.join(poktDir, "mcp.json");
  if (!fs.existsSync(poktDir)) {
    fs.mkdirSync(poktDir, { recursive: true });
  }
  if (fs.existsSync(mcpPath)) {
    return { created: false, path: mcpPath, poktDir };
  }
  fs.writeFileSync(mcpPath, MCP_JSON_TEMPLATE.trimStart(), "utf8");
  return { created: true, path: mcpPath, poktDir };
}

export function getMergedMcpServers(cwd: string = process.cwd()): {
  merged: McpServerConfig[];
  poktDir: string | null;
  mcpJsonPath: string | null;
} {
  const poktDir = findPoktCliFolder(cwd);
  const loaded = poktDir ? loadProjectMcpJson(poktDir) : null;
  const project = loaded?.servers ?? [];
  const c: KronosConfig = loadConfig();
  const globalServers = c.mcpServers ?? [];
  return {
    merged: mergeMcpConfigs(globalServers, project),
    poktDir,
    mcpJsonPath: loaded?.mcpJsonPath ?? null
  };
}
