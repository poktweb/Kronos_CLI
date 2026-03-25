import inquirer from "inquirer";
import {
  detectShellExecutionIntent,
  generateAssistantReply,
  quickShellExecutionHint,
  suggestLinuxCommand
} from "../ai.js";
import {
  getEffectiveActiveModel,
  loadConfig,
  syncDefaultProviderFromActiveModel
} from "../config.js";
import { ensureHostContextForActions, formatHostSummaryForPrompt } from "../host-context.js";
import { runCommand, runCommandCapture } from "../shell.js";
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
        "Você é o Kronos CLI, assistente de terminal (Linux, macOS, Windows). Ajude de forma objetiva e segura. " +
        "Quando receber a saída real de um comando executado no sistema do usuário, interprete e responda em português (ex.: liste portas abertas, erros, próximos passos)."
    }
  ];

  console.log(
    `Kronos Chat iniciado com ${provider.name} (${provider.model}). Digite 'sair' para encerrar. ` +
      "Pedidos como varredura nmap podem gerar um comando para você confirmar antes de executar."
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
        const host = ensureHostContextForActions();
        const hostSummary = formatHostSummaryForPrompt(host);
        console.log(ui.dim(`Ambiente: ${hostSummary}`));

        const cmd = await suggestLinuxCommand(provider, commandRequest, hostSummary);
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

    if (quickShellExecutionHint(trimmed)) {
      try {
        const host = ensureHostContextForActions();
        const hostSummary = formatHostSummaryForPrompt(host);
        const wantsShell = await detectShellExecutionIntent(provider, trimmed, hostSummary);
        if (wantsShell) {
          console.log(ui.dim(`Ambiente: ${hostSummary}`));

          const cmd = await suggestLinuxCommand(provider, trimmed, hostSummary);
          console.log(`Comando sugerido: ${cmd}`);

          const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
            {
              type: "confirm",
              name: "confirm",
              message: "Executar este comando e usar a saída na resposta?",
              default: false
            }
          ]);

          history.push({ role: "user", content: trimmed });

          if (confirm) {
            console.log(ui.dim("Executando e capturando saída…"));
            let result;
            try {
              result = await runCommandCapture(cmd);
            } catch (execErr) {
              const errText =
                execErr instanceof Error ? execErr.message : String(execErr);
              const reply = await generateAssistantReply(provider, [
                ...history,
                {
                  role: "user",
                  content:
                    "A execução do comando falhou no sistema do usuário. Erro técnico:\n" + errText
                }
              ]);
              history.push({ role: "assistant", content: reply });
              console.log(`\n${reply}\n`);
              continue;
            }

            const extra =
              (result.timedOut ? "Aviso: o comando foi encerrado por tempo limite.\n\n" : "") +
              `Comando: ${cmd}\nCódigo de saída: ${result.code ?? "null"}\n\n` +
              (result.stdout ? `stdout:\n${result.stdout}\n` : "") +
              (result.stderr ? `\nstderr:\n${result.stderr}` : "");

            try {
              const reply = await generateAssistantReply(provider, [
                ...history,
                {
                  role: "user",
                  content:
                    "Resultado da execução no sistema do usuário (use para responder ao pedido acima):\n\n" +
                    extra
                }
              ]);
              history.push({ role: "assistant", content: reply });
              console.log(`\n${reply}\n`);
            } catch (error) {
              console.error(
                `Erro ao gerar resposta após execução: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
              const fallback = `Comando executado; não foi possível pedir interpretação ao modelo. Saída:\n\n${extra}`;
              history.push({ role: "assistant", content: fallback });
              console.log(`\n${fallback}\n`);
            }
          } else {
            const reply = await generateAssistantReply(provider, history);
            history.push({ role: "assistant", content: reply });
            console.log(`\n${reply}\n`);
          }

          continue;
        }
      } catch (error) {
        console.error(
          `Erro ao analisar/execução de ferramenta: ${
            error instanceof Error ? error.message : String(error)
          }`
        );
      }
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
