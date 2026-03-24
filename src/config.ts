import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type {
  ActiveModel,
  KronosConfig,
  MenuProvider,
  ProviderType,
  RegisteredModel
} from "./types.js";

export type { MenuProvider } from "./types.js";

const CONFIG_DIR = path.join(os.homedir(), ".kronos");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

export const PROVIDER_LABELS: Record<MenuProvider, string> = {
  controller: "Pokt API (Controller)",
  openai: "OpenAI",
  grok: "Grok (xAI)",
  openrouter: "OpenRouter",
  gemini: "Gemini",
  ollama: "Ollama (local)",
  "ollama-cloud": "Ollama Cloud"
};

export const ALL_PROVIDERS: readonly MenuProvider[] = Object.keys(
  PROVIDER_LABELS
) as MenuProvider[];

/** Provedores no menu principal: OpenRouter e Ollama local. */
export const MENU_PROVIDERS: readonly ProviderType[] = ["openrouter", "ollama"];

const defaultConfig: KronosConfig = {
  defaultProvider: "openrouter",
  providers: {
    openrouter: {
      type: "openrouter",
      name: "OpenRouter",
      baseUrl: "https://openrouter.ai",
      model: "openai/gpt-5.2",
      apiKey: "",
      siteUrl: "",
      appName: "Kronos CLI"
    },
    ollama: {
      type: "ollama",
      name: "Ollama (Local)",
      baseUrl: "http://localhost:11434",
      model: "llama3.1:8b",
      apiKey: ""
    },
    "ollama-cloud": {
      type: "ollama-cloud",
      name: "Ollama Cloud",
      baseUrl: "https://ollama.com",
      model: "gpt-oss:120b",
      apiKey: ""
    }
  }
};

function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

function defaultRegisteredModels(c: KronosConfig): RegisteredModel[] {
  return [
    { provider: "openrouter", id: c.providers.openrouter.model },
    { provider: "ollama", id: c.providers.ollama.model }
  ];
}

export function ensureMenuState(c: KronosConfig): void {
  if (!c.registeredModels || c.registeredModels.length === 0) {
    c.registeredModels = defaultRegisteredModels(c);
    saveConfig(c);
  }
}

export function loadConfig(): KronosConfig {
  ensureConfigDir();

  if (!fs.existsSync(CONFIG_FILE)) {
    const fresh = { ...defaultConfig };
    ensureMenuState(fresh);
    return fresh;
  }

  try {
    const raw = fs.readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<KronosConfig>;
    const merged: KronosConfig = {
      ...defaultConfig,
      ...parsed,
      providers: {
        ...defaultConfig.providers,
        ...(parsed.providers ?? {})
      }
    };
    ensureMenuState(merged);
    return merged;
  } catch {
    const fresh = { ...defaultConfig };
    ensureMenuState(fresh);
    saveConfig(fresh);
    return fresh;
  }
}

export function saveConfig(config: KronosConfig): void {
  ensureConfigDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function getOpenRouterToken(): string {
  return loadConfig().providers.openrouter.apiKey?.trim() ?? "";
}

export function getOllamaCloudApiKey(): string {
  return loadConfig().providers["ollama-cloud"].apiKey?.trim() ?? "";
}

export function getOllamaBaseUrl(): string {
  return loadConfig().providers.ollama.baseUrl.replace(/\/$/, "") || "http://localhost:11434";
}

export function getOpenAIApiKey(): string {
  const c = loadConfig();
  return (c.openaiApiKey ?? "").trim() || process.env.OPENAI_API_KEY?.trim() || "";
}

export function getGrokApiKey(): string {
  const c = loadConfig();
  return (c.grokApiKey ?? "").trim() || process.env.XAI_API_KEY?.trim() || process.env.GROK_API_KEY?.trim() || "";
}

export function getGeminiApiKey(): string {
  const c = loadConfig();
  return (c.geminiApiKey ?? "").trim() || process.env.GEMINI_API_KEY?.trim() || process.env.GOOGLE_API_KEY?.trim() || "";
}

export function getPoktToken(): string {
  const c = loadConfig();
  return (c.poktToken ?? "").trim() || process.env.POKT_TOKEN?.trim() || "";
}

export function getEffectiveActiveModel(): ActiveModel | null {
  const c = loadConfig();
  ensureMenuState(c);
  if (c.activeModel) {
    return c.activeModel;
  }
  const p = c.defaultProvider;
  return { provider: p, id: c.providers[p].model };
}

export function getPoktApiBaseUrl(): string {
  return "https://poktcliback-production.up.railway.app";
}

export function getProPortalBaseUrl(): string {
  return "https://poktcliback-production.up.railway.app";
}

export function getTokenPurchaseUrl(): string {
  return "https://pokt-cli-controller.vercel.app";
}

export function getProPurchaseUrl(): string {
  return getTokenPurchaseUrl();
}

/** Sincroniza defaultProvider + model do provider quando o modelo ativo é suportado pelo runtime do Kronos. */
export function syncDefaultProviderFromActiveModel(): void {
  const m = getEffectiveActiveModel();
  if (!m) return;
  const pt = m.provider;
  if (pt === "openrouter" || pt === "ollama" || pt === "ollama-cloud") {
    const c = loadConfig();
    c.defaultProvider = pt;
    c.providers[pt] = { ...c.providers[pt], model: m.id };
    c.activeModel = m;
    saveConfig(c);
  }
}
