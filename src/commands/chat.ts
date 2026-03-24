import inquirer from "inquirer";
import { generateAssistantReply, suggestLinuxCommand } from "../ai.js";
import {
  getEffectiveActiveModel,
  loadConfig,
  syncDefaultProviderFromActiveModel
} from "../config.js";
import { runCommand } from "../shell.js";
import type { ChatMessage } from "../types.js";
import { ui } from "../ui.js";

const SUPPORTED_CHAT = new Set(["openrouter", "ollama", "ollama-cloud"]);

export async function runChatMode(opts?: { fromMenu?: boolean }): Promise<void> {
  void opts;
  const active = getEffectiveActiveModel();
  if (!active || !SUPPORTED_CHAT.has(active.provider)) {
    console.log(
      ui.error(
        "Nenhum modelo compatível com o chat do Kronos. No menu, escolha OpenRouter ou Ollama e selecione um modelo."
      )
    );
    return;
  }
  syncDefaultProviderFromActiveModel();
  const config = loadConfig();
  const provider = config.providers[config.defaultProvider];
  const history: ChatMessage[] = [
    {
      role: "system",
      content:
        "Você é o Kronos CLI, assistente Linux. Ajude de forma objetiva e segura."
    }
  ];

  console.log(
    `Kronos Chat iniciado com ${provider.name} (${provider.model}). Digite 'sair' para encerrar.`
  );

  while (true) {
    const { input } = await inquirer.prompt<{ input: string }>([
      { type: "input", name: "input", message: "kronos>" }
    ]);

    const trimmed = input.trim();
    if (!trimmed) {
      continue;
    }

    if (trimmed.toLowerCase() === "sair") {
      break;
    }

    if (trimmed.startsWith("!")) {
      const commandRequest = trimmed.slice(1).trim();
      if (!commandRequest) {
        console.log("Pedido de comando vazio.");
        continue;
      }

      try {
        const cmd = await suggestLinuxCommand(provider, commandRequest);
        console.log(`Comando sugerido: ${cmd}`);

        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: "confirm",
            name: "confirm",
            message: "Executar comando agora?",
            default: false
          }
        ]);

        if (confirm) {
          await runCommand(cmd);
        }
      } catch (error) {
        console.error(
          `Erro ao sugerir comando: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }

      continue;
    }

    history.push({ role: "user", content: trimmed });

    try {
      const reply = await generateAssistantReply(provider, history);
      history.push({ role: "assistant", content: reply });
      console.log(`\n${reply}\n`);
    } catch (error) {
      console.error(
        `Erro no chat: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
