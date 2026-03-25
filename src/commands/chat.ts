import inquirer from "inquirer";
import {
  detectShellExecutionIntent,
  generateAssistantReplyWithFallback,
  quickShellExecutionHint,
  suggestLinuxCommandWithFallback
} from "../ai.js";
import {
  getEffectiveActiveModel,
  loadConfig,
  syncDefaultProviderFromActiveModel
} from "../config.js";
import { ensureHostContextForActions, formatHostSummaryForPrompt } from "../host-context.js";
import { runCommandCapture } from "../shell.js";
import type { ChatMessage } from "../types.js";
import { ui } from "../ui.js";

const SUPPORTED_CHAT = new Set(["openrouter", "ollama", "ollama-cloud"]);

export async function runChatMode(opts?: { fromMenu?: boolean }): Promise<void> {
  void opts;
  const active = getEffectiveActiveModel();
  if (!active || !SUPPORTED_CHAT.has(active.provider)) {
    console.log(
      ui.error(
        "Nenhum modelo compatível com o chat do Kronos. No menu, escolha OpenRouter, Ollama (local) ou Ollama Cloud e selecione um modelo."
      )
    );
    return;
  }
  syncDefaultProviderFromActiveModel();
  let config = loadConfig();
  let provider = config.providers[config.defaultProvider];
  const onModelSwitch = (from: string, to: string) =>
    console.log(ui.dim(`Recusa ou falha no modelo ${from}; tentando ${to}…`));
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
        config = loadConfig();
        const host = ensureHostContextForActions();
        const hostSummary = formatHostSummaryForPrompt(host);
        console.log(ui.dim(`Ambiente: ${hostSummary}`));

        const cmd = await suggestLinuxCommandWithFallback(config, commandRequest, hostSummary, {
          onModelSwitch
        });
        config = loadConfig();
        provider = config.providers[config.defaultProvider];
        console.log(`Comando sugerido: ${cmd}`);

        const { confirm } = await inquirer.prompt<{ confirm: boolean }>([
          {
            type: "confirm",
            name: "confirm",
            message: "Executar comando agora? (saída será interpretada pelo Kronos e o chat continua)",
            default: false
          }
        ]);

        history.push({ role: "user", content: `[pedido de comando] ${commandRequest}` });

        if (confirm) {
          console.log(ui.dim("Executando (saída em tempo real); aguarde o fim para a análise…"));
          let result;
          try {
            result = await runCommandCapture(cmd, { mirror: true });
          } catch (execErr) {
            const errText = execErr instanceof Error ? execErr.message : String(execErr);
            config = loadConfig();
            const { reply } = await generateAssistantReplyWithFallback(
              config,
              [
                ...history,
                {
                  role: "user",
                  content:
                    "A execução do comando falhou no sistema do usuário. Erro técnico:\n" + errText
                }
              ],
              { onModelSwitch }
            );
            config = loadConfig();
            provider = config.providers[config.defaultProvider];
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
            config = loadConfig();
            const { reply } = await generateAssistantReplyWithFallback(
              config,
              [
                ...history,
                {
                  role: "user",
                  content:
                    "Resultado da execução no sistema do usuário (interprete, responda em português e diga próximos passos se fizer sentido):\n\n" +
                    extra
                }
              ],
              { onModelSwitch }
            );
            config = loadConfig();
            provider = config.providers[config.defaultProvider];
            history.push({ role: "assistant", content: reply });
            console.log(`\n${reply}\n`);
          } catch (error) {
            console.error(
              `Erro ao gerar resposta após execução: ${
                error instanceof Error ? error.message : String(error)
              }`
            );
            const fallback = `Comando executado; não foi possível pedir interpretação ao modelo. Trecho da saída:\n\n${extra.slice(0, 8000)}`;
            history.push({ role: "assistant", content: fallback });
            console.log(`\n${fallback}\n`);
          }
        } else {
          config = loadConfig();
          const { reply } = await generateAssistantReplyWithFallback(config, history, {
            onModelSwitch
          });
          config = loadConfig();
          provider = config.providers[config.defaultProvider];
          history.push({ role: "assistant", content: reply });
          console.log(`\n${reply}\n`);
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
        config = loadConfig();
        const host = ensureHostContextForActions();
        const hostSummary = formatHostSummaryForPrompt(host);
        const wantsShell = await detectShellExecutionIntent(config, trimmed, hostSummary);
        config = loadConfig();
        provider = config.providers[config.defaultProvider];
        if (wantsShell) {
          console.log(ui.dim(`Ambiente: ${hostSummary}`));

          const cmd = await suggestLinuxCommandWithFallback(config, trimmed, hostSummary, {
            onModelSwitch
          });
          config = loadConfig();
          provider = config.providers[config.defaultProvider];
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
            console.log(ui.dim("Executando e capturando saída (também exibida no terminal)…"));
            let result;
            try {
              result = await runCommandCapture(cmd, { mirror: true });
            } catch (execErr) {
              const errText =
                execErr instanceof Error ? execErr.message : String(execErr);
              config = loadConfig();
              const { reply } = await generateAssistantReplyWithFallback(config, [
                ...history,
                {
                  role: "user",
                  content:
                    "A execução do comando falhou no sistema do usuário. Erro técnico:\n" + errText
                }
              ], { onModelSwitch });
              config = loadConfig();
              provider = config.providers[config.defaultProvider];
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
              config = loadConfig();
              const { reply } = await generateAssistantReplyWithFallback(
                config,
                [
                  ...history,
                  {
                    role: "user",
                    content:
                      "Resultado da execução no sistema do usuário (use para responder ao pedido acima):\n\n" +
                      extra
                  }
                ],
                { onModelSwitch }
              );
              config = loadConfig();
              provider = config.providers[config.defaultProvider];
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
            config = loadConfig();
            const { reply } = await generateAssistantReplyWithFallback(config, history, {
              onModelSwitch
            });
            config = loadConfig();
            provider = config.providers[config.defaultProvider];
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
      config = loadConfig();
      const { reply } = await generateAssistantReplyWithFallback(config, history, {
        onModelSwitch
      });
      config = loadConfig();
      provider = config.providers[config.defaultProvider];
      history.push({ role: "assistant", content: reply });
      console.log(`\n${reply}\n`);
    } catch (error) {
      console.error(
        `Erro no chat: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}
