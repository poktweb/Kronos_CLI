import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { KronosConfig } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".kronos");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const defaultConfig: KronosConfig = {
  defaultProvider: "openrouter",
  providers: {
    openrouter: {
      type: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai/api/v1",
      model: "openai/gpt-4o-mini",
      apiKey: ""
    },
    ollama: {
      type: "ollama",
      name: "Ollama (Local)",
      baseUrl: "http://localhost:11434/v1",
      model: "llama3.1:8b",
      apiKey: ""
    },
    "ollama-cloud": {
      type: "ollama-cloud",
      name: "Ollama Cloud",
      baseUrl: "https://ollama.com/api/v1",
      model: "llama3.1:8b",
      apiKey: ""
    }
  }
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): KronosConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    saveConfig(defaultConfig);
    return defaultConfig;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<KronosConfig>;
    return {
      ...defaultConfig,
      ...parsed,
      providers: {
        ...defaultConfig.providers,
        ...(parsed.providers ?? {})
      }
    };
  } catch {
    saveConfig(defaultConfig);
    return defaultConfig;
  }
}

export function saveConfig(config: KronosConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}
