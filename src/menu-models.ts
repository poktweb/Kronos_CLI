import ora from "ora";
import {
  getGrokApiKey,
  getOllamaBaseUrl,
  getOllamaCloudApiKey,
  getOpenAIApiKey,
  getOpenRouterToken,
  loadConfig,
  PROVIDER_LABELS,
  saveConfig,
  type MenuProvider
} from "./config.js";
import type { RegisteredModel } from "./types.js";
import { ui } from "./ui.js";

type ModelsAction =
  | "fetch-openai"
  | "fetch-grok"
  | "fetch-openrouter"
  | "fetch-ollama"
  | "fetch-ollama-cloud"
  | "add-openai"
  | "add-grok"
  | "add-openrouter"
  | "add-ollama"
  | "add-ollama-cloud";

function getModels(): RegisteredModel[] {
  const c = loadConfig();
  return c.registeredModels ?? [];
}

function setModels(models: RegisteredModel[]): void {
  const c = loadConfig();
  c.registeredModels = models;
  saveConfig(c);
}

export async function runModelsAction(action: string, id?: string): Promise<void> {
  if (action === "fetch-openai") {
    const apiKey = getOpenAIApiKey();
    if (!apiKey) {
      console.log(ui.error("OpenAI API key not set. Use: kronos config set-openai -v <key> ou defina OPENAI_API_KEY"));
      return;
    }
    const spinner = ora("Fetching OpenAI models...").start();
    try {
      const response = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!response.ok) {
        spinner.fail(ui.error(`Failed to fetch OpenAI models: HTTP ${response.status}`));
        const body = await response.text();
        if (body) console.log(ui.dim(body.slice(0, 200)));
        return;
      }
      const data = (await response.json()) as { data?: { id: string }[] };
      const openaiModels = (data.data || []).map((m) => ({ provider: "openai", id: m.id }));
      const currentModels = getModels();
      const otherModels = currentModels.filter((m) => m.provider !== "openai");
      setModels([...otherModels, ...openaiModels]);
      spinner.succeed(ui.success(`Synchronized ${openaiModels.length} OpenAI models.`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      spinner.fail(ui.error(`Failed to fetch OpenAI models: ${msg}`));
      console.log(ui.warn("Check your network and API key. Run: kronos config (menu)"));
    }
    return;
  }

  if (action === "fetch-grok") {
    const apiKey = getGrokApiKey();
    if (!apiKey) {
      console.log(ui.error("Grok (xAI) API key not set. Use: kronos config set-grok -v <key> ou defina XAI_API_KEY"));
      return;
    }
    const spinner = ora("Fetching Grok (xAI) models...").start();
    try {
      const response = await fetch("https://api.x.ai/v1/models", {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!response.ok) {
        spinner.fail(ui.error(`Failed to fetch Grok (xAI) models: HTTP ${response.status}`));
        const body = await response.text();
        if (body) console.log(ui.dim(body.slice(0, 200)));
        return;
      }
      const data = (await response.json()) as { data?: { id: string }[] };
      const grokModels = (data.data || []).map((m) => ({ provider: "grok", id: m.id }));
      const currentModels = getModels();
      const otherModels = currentModels.filter((m) => m.provider !== "grok");
      setModels([...otherModels, ...grokModels]);
      spinner.succeed(ui.success(`Synchronized ${grokModels.length} Grok (xAI) models.`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      spinner.fail(ui.error(`Failed to fetch Grok (xAI) models: ${msg}`));
      console.log(ui.warn("Check your network and API key."));
    }
    return;
  }

  if (action === "fetch-openrouter") {
    const spinner = ora("Fetching OpenRouter models...").start();
    try {
      const orToken = getOpenRouterToken();
      const response = await fetch("https://openrouter.ai/api/v1/models", {
        headers: orToken ? { Authorization: `Bearer ${orToken}` } : undefined
      });
      if (!response.ok) {
        spinner.fail(ui.error(`Failed to fetch OpenRouter models: HTTP ${response.status}`));
        const body = await response.text();
        if (body) console.log(ui.dim(body.slice(0, 200)));
        console.log(ui.warn("Check your network and OpenRouter token."));
        return;
      }
      const data = (await response.json()) as { data?: { id: string }[] };
      const openrouterModels = (data.data || []).map((m) => ({ provider: "openrouter", id: m.id }));
      const currentModels = getModels();
      const otherModels = currentModels.filter((m) => m.provider !== "openrouter");
      setModels([...otherModels, ...openrouterModels]);
      spinner.succeed(ui.success(`Synchronized ${openrouterModels.length} OpenRouter models.`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      spinner.fail(ui.error(`Failed to fetch OpenRouter models: ${msg}`));
      console.log(ui.warn("Check your network."));
    }
    return;
  }

  if (action === "fetch-ollama") {
    const baseUrl = getOllamaBaseUrl().replace(/\/$/, "");
    const url = `${baseUrl}/api/tags`;
    const spinner = ora(`Fetching Ollama models (${url})...`).start();
    try {
      const response = await fetch(url);
      if (!response.ok) {
        spinner.fail(ui.error(`Failed to fetch Ollama models: HTTP ${response.status}`));
        console.log(ui.warn("Check Ollama is running and ollama Base URL."));
        return;
      }
      const data = (await response.json()) as { models?: { name: string }[] };
      const names = (data.models || []).map((m) => m.name);
      const ollamaModels = names.map((name) => ({ provider: "ollama", id: name }));
      const currentModels = getModels();
      const otherModels = currentModels.filter((m) => m.provider !== "ollama");
      setModels([...otherModels, ...ollamaModels]);
      spinner.succeed(ui.success(`Synchronized ${ollamaModels.length} Ollama (local) models.`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      spinner.fail(ui.error(`Failed to fetch Ollama models: ${msg}`));
      console.log(ui.warn("Check Ollama is running."));
    }
    return;
  }

  if (action === "fetch-ollama-cloud") {
    const apiKey = getOllamaCloudApiKey();
    if (!apiKey) {
      console.log(ui.error("Ollama Cloud API key not set. Run: kronos config set-ollama-cloud -v <key>"));
      console.log(ui.dim("Create keys at: https://ollama.com/settings/keys"));
      return;
    }
    const spinner = ora("Fetching Ollama Cloud models (https://ollama.com/api/tags)...").start();
    try {
      const response = await fetch("https://ollama.com/api/tags", {
        headers: { Authorization: `Bearer ${apiKey}` }
      });
      if (!response.ok) {
        spinner.fail(ui.error(`Failed to fetch Ollama Cloud models: HTTP ${response.status}`));
        const body = await response.text();
        if (body) console.log(ui.dim(body.slice(0, 200)));
        return;
      }
      const data = (await response.json()) as { models?: { name: string }[] };
      const names = (data.models || []).map((m) => m.name);
      const ollamaCloudModels = names.map((name) => ({ provider: "ollama-cloud", id: name }));
      const currentModels = getModels();
      const otherModels = currentModels.filter((m) => m.provider !== "ollama-cloud");
      setModels([...otherModels, ...ollamaCloudModels]);
      spinner.succeed(ui.success(`Synchronized ${ollamaCloudModels.length} Ollama Cloud models.`));
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      spinner.fail(ui.error(`Failed to fetch Ollama Cloud models: ${msg}`));
      console.log(ui.warn("Check your network and API key."));
    }
    return;
  }

  const addActions: ModelsAction[] = [
    "add-openai",
    "add-grok",
    "add-openrouter",
    "add-ollama",
    "add-ollama-cloud"
  ];
  if (addActions.includes(action as ModelsAction) && id) {
    const prov = action.replace("add-", "") as MenuProvider;
    const models = getModels();
    if (!models.find((m) => m.id === id && m.provider === prov)) {
      models.push({ provider: prov, id });
      setModels(models);
      const label = PROVIDER_LABELS[prov as keyof typeof PROVIDER_LABELS] ?? prov;
      console.log(ui.success(`Added ${label} model: ${id}`));
    } else {
      console.log(ui.warn(`Model ${id} already exists for this provider.`));
    }
  }
}
