import chalk from "chalk";
import {
  getEffectiveActiveModel,
  getGeminiApiKey,
  getGrokApiKey,
  getOllamaBaseUrl,
  getOllamaCloudApiKey,
  getOpenAIApiKey,
  getOpenRouterToken,
  getPoktApiBaseUrl,
  getPoktToken,
  getProPortalBaseUrl,
  getTokenPurchaseUrl,
  PROVIDER_LABELS,
  type MenuProvider
} from "./config.js";
import { ui } from "./ui.js";

function mask(value: string): string {
  if (!value) return "(not set)";
  if (value.length <= 8) return "****";
  return value.slice(0, 4) + "****" + value.slice(-2);
}

export async function runDoctor(): Promise<void> {
  const active = getEffectiveActiveModel();
  if (!active) {
    console.log(ui.error("Nenhum modelo ativo. Rode o menu e selecione um modelo."));
    return;
  }

  const label =
    PROVIDER_LABELS[active.provider as keyof typeof PROVIDER_LABELS] ?? active.provider;
  console.log(ui.dim(`\nProvider ativo: ${label}`));
  console.log(ui.dim(`Model ativo: ${active.id}\n`));

  const required: Partial<
    Record<
      MenuProvider,
      { name: string; value: string; hint?: string } | null
    >
  > = {
    controller: {
      name: "POKT_TOKEN",
      value: getPoktToken(),
      hint: "menu → Configure API Keys → Pokt Token"
    },
    openai: {
      name: "OPENAI_API_KEY",
      value: getOpenAIApiKey(),
      hint: "menu → Configure API Keys → OpenAI API Key"
    },
    grok: {
      name: "XAI_API_KEY",
      value: getGrokApiKey(),
      hint: "menu → Configure API Keys → Grok (xAI) API Key"
    },
    openrouter: {
      name: "OPENROUTER_API_KEY",
      value: getOpenRouterToken(),
      hint: "menu → Configure API Keys → OpenRouter Token"
    },
    gemini: {
      name: "GEMINI_API_KEY",
      value: getGeminiApiKey(),
      hint: "menu → Configure API Keys → Gemini API Key"
    },
    "ollama-cloud": {
      name: "OLLAMA_CLOUD_API_KEY",
      value: getOllamaCloudApiKey(),
      hint: "menu → Configure API Keys → Ollama Cloud API Key"
    },
    ollama: null
  };

  const req = required[active.provider as MenuProvider] ?? null;
  if (req) {
    if (!req.value) {
      console.log(ui.error(`Faltando credencial: ${req.name}`));
      if (req.hint) console.log(ui.dim(`Dica: ${req.hint}`));
      return;
    }
    console.log(ui.success(`Credencial OK: ${req.name} = ${mask(req.value)}`));
    if (active.provider === "controller") {
      console.log(ui.dim(`  API Pokt (chat): ${getPoktApiBaseUrl()}`));
      console.log(ui.dim(`  Painel / serviço: ${getProPortalBaseUrl()}`));
      console.log(ui.dim(`  Comprar token: ${getTokenPurchaseUrl()}`));
    }
  } else {
    console.log(ui.dim("Provider local (Ollama) — sem API key obrigatória."));
  }

  const supported = ["openrouter", "ollama", "ollama-cloud"];
  if (!supported.includes(active.provider)) {
    console.log(
      chalk.yellow(
        `\nO chat do Kronos usa apenas: ${supported.join(", ")}. Troque o provider no menu para usar o chat.`
      )
    );
    return;
  }

  try {
    if (active.provider === "openrouter") {
      const r = await fetch("https://openrouter.ai/api/v1/models", {
        headers: getOpenRouterToken()
          ? { Authorization: `Bearer ${getOpenRouterToken()}` }
          : undefined
      });
      console.log(
        r.ok
          ? ui.success(`Conectividade OpenRouter: OK (HTTP ${r.status})`)
          : ui.error(`OpenRouter: HTTP ${r.status}`)
      );
    } else if (active.provider === "ollama") {
      const base = getOllamaBaseUrl();
      const r = await fetch(`${base}/api/tags`);
      console.log(
        r.ok
          ? ui.success(`Ollama local (${base}): OK`)
          : ui.error(`Ollama local: HTTP ${r.status}`)
      );
    } else if (active.provider === "ollama-cloud") {
      const r = await fetch("https://ollama.com/api/tags", {
        headers: { Authorization: `Bearer ${getOllamaCloudApiKey()}` }
      });
      console.log(
        r.ok
          ? ui.success(`Ollama Cloud: OK`)
          : ui.error(`Ollama Cloud: HTTP ${r.status}`)
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.log(ui.error(`Falha de rede: ${msg}`));
  }
  console.log("");
}
