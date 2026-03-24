import inquirer from "inquirer";
import { getConfigPath, loadConfig, saveConfig } from "../config.js";
import type { ProviderType } from "../types.js";

type ConfigAction =
  | "set-openrouter"
  | "set-ollama-cloud"
  | "clear-openrouter"
  | "clear-ollama-cloud"
  | "show";

const providerOptions: Array<{ value: ProviderType; label: string }> = [
  { value: "openrouter", label: "OpenRouter (token)" },
  { value: "ollama-cloud", label: "Ollama Cloud (token)" }
];

function maskToken(token?: string): string {
  if (!token) return "(not set)";
  return token.length > 8 ? `${token.slice(0, 8)}****` : "****";
}

export async function runConfigureCommand(
  action?: string,
  value?: string
): Promise<void> {
  const config = loadConfig();

  const directAction = action as ConfigAction | undefined;
  if (directAction) {
    if (directAction === "show") {
      console.log("\nConfig atual (tokens mascarados):");
      console.log(`  OpenRouter: ${maskToken(config.providers.openrouter.apiKey)}`);
      console.log(
        `  Ollama Cloud: ${maskToken(config.providers["ollama-cloud"].apiKey)}`
      );
      console.log(`  Provider padrão: ${config.defaultProvider}`);
      return;
    }

    if (directAction === "clear-openrouter") {
      config.providers.openrouter.apiKey = "";
      saveConfig(config);
      console.log("Token OpenRouter removido.");
      return;
    }

    if (directAction === "clear-ollama-cloud") {
      config.providers["ollama-cloud"].apiKey = "";
      saveConfig(config);
      console.log("Token Ollama Cloud removido.");
      return;
    }

    if (!value?.trim()) {
      console.log("Use: kronos config <acao> -v <token>");
      return;
    }

    if (directAction === "set-openrouter") {
      config.providers.openrouter.apiKey = value.trim();
      config.defaultProvider = "openrouter";
      saveConfig(config);
      console.log("Token OpenRouter salvo e definido como padrão.");
      return;
    }

    if (directAction === "set-ollama-cloud") {
      config.providers["ollama-cloud"].apiKey = value.trim();
      config.defaultProvider = "ollama-cloud";
      saveConfig(config);
      console.log("Token Ollama Cloud salvo e definido como padrão.");
      return;
    }

    console.log(
      "Ação inválida. Use: show, set-openrouter, set-ollama-cloud, clear-openrouter, clear-ollama-cloud."
    );
    return;
  }

  const { provider } = await inquirer.prompt<{ provider: ProviderType }>([
    {
      type: "list",
      name: "provider",
      message: "Selecione o provider para configurar o token:",
      choices: providerOptions.map((item) => ({
        name: item.label,
        value: item.value
      }))
    }
  ]);

  const current = config.providers[provider];
  const answers = await inquirer.prompt<{
    apiKey: string;
    setAsDefault: boolean;
  }>([
    {
      type: "password",
      name: "apiKey",
      message: "Token/API Key:",
      mask: "*"
    },
    {
      type: "confirm",
      name: "setAsDefault",
      message: "Definir como provider padrão?",
      default: config.defaultProvider === provider
    }
  ]);

  config.providers[provider] = {
    ...current,
    apiKey: answers.apiKey ? answers.apiKey.trim() : current.apiKey
  };

  if (answers.setAsDefault) {
    config.defaultProvider = provider;
  }

  saveConfig(config);
  console.log(`Configuração salva em: ${getConfigPath()}.`);
}
