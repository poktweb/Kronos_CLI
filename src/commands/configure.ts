import inquirer from "inquirer";
import { getConfigPath, loadConfig, saveConfig } from "../config.js";
import type { ProviderType } from "../types.js";

const providerOptions: Array<{ value: ProviderType; label: string }> = [
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (Local)" },
  { value: "ollama-cloud", label: "Ollama Cloud" }
];

export async function runConfigureCommand(): Promise<void> {
  const config = loadConfig();

  const { provider } = await inquirer.prompt<{ provider: ProviderType }>([
    {
      type: "list",
      name: "provider",
      message: "Qual provider deseja configurar?",
      choices: providerOptions.map((item) => ({
        name: item.label,
        value: item.value
      }))
    }
  ]);

  const current = config.providers[provider];
  const answers = await inquirer.prompt<{
    baseUrl: string;
    model: string;
    apiKey: string;
    setAsDefault: boolean;
  }>([
    {
      type: "input",
      name: "baseUrl",
      message: "Base URL:",
      default: current.baseUrl
    },
    {
      type: "input",
      name: "model",
      message: "Modelo:",
      default: current.model
    },
    {
      type: "password",
      name: "apiKey",
      message: "API Key (deixe vazio para manter):",
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
    baseUrl: answers.baseUrl.trim(),
    model: answers.model.trim(),
    apiKey: answers.apiKey ? answers.apiKey.trim() : current.apiKey
  };

  if (answers.setAsDefault) {
    config.defaultProvider = provider;
  }

  saveConfig(config);
  console.log(`Configuração salva em: ${getConfigPath()}`);
}
