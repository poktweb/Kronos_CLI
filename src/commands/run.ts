import inquirer from "inquirer";
import {
  generateAssistantReplyWithFallback,
  suggestLinuxCommandWithFallback
} from "../ai.js";
import {
  getEffectiveActiveModel,
  loadConfig,
  syncDefaultProviderFromActiveModel
} from "../config.js";
import { formatHostSummaryForPrompt, ensureHostContextForActions } from "../host-context.js";
import { runCommandCapture } from "../shell.js";
import type { ChatMessage } from "../types.js";
import { ui } from "../ui.js";

const SUPPORTED = new Set(["openrouter", "ollama", "ollama-cloud"]);

export async function runDirectRequest(request: string): Promise<void> {
  const active = getEffectiveActiveModel();
  if (!active || !SUPPORTED.has(active.provider)) {
    console.log(
      ui.error(
        "Configure um modelo OpenRouter ou Ollama no menu antes de usar `kronos run`."
      )
    );
    return;
  }
  syncDefaultProviderFromActiveModel();
  let config = loadConfig();
  const onModelSwitch = (from: string, to: string) =>
    console.log(ui.dim(`Recusa ou falha no modelo ${from}; tentando ${to}…`));

  const systemMsg: ChatMessage = {
    role: "system",
    content:
      "Você é o Kronos CLI. O usuário pediu um comando em linguagem natural; ele foi executado no terminal dele. " +
      "Resuma a saída em português, destaque erros ou avisos e sugira próximos passos se fizer sentido. Seja objetivo."
  };

  let nextRequest = request.trim();
  if (!nextRequest) {
    console.log(ui.warn("Pedido vazio."));
    return;
  }

  try {
    const host = ensureHostContextForActions();
    const hostSummary = formatHostSummaryForPrompt(host);

    while (nextRequest) {
      console.log(ui.dim(`Ambiente detectado: ${hostSummary}`));

      const command = await suggestLinuxCommandWithFallback(config, nextRequest, hostSummary, {
        onModelSwitch
      });
      config = loadConfig();
      console.log(`Comando sugerido: ${command}`);

      const { execute } = await inquirer.prompt<{ execute: boolean }>([
        {
          type: "confirm",
          name: "execute",
          message: "Deseja executar esse comando? (a saída aparece no terminal e o Kronos interpreta ao final)",
          default: true
        }
      ]);

      if (!execute) {
        console.log("Execução cancelada.");
        const { followUp } = await inquirer.prompt<{ followUp: boolean }>([
          {
            type: "confirm",
            name: "followUp",
            message: "Fazer outro pedido?",
            default: false
          }
        ]);
        if (!followUp) return;
        const { text } = await inquirer.prompt<{ text: string }>([
          { type: "input", name: "text", message: "Próximo pedido:" }
        ]);
        nextRequest = (text ?? "").trim();
        continue;
      }

      console.log(ui.dim("Executando… (saída em tempo real)"));
      try {
        const result = await runCommandCapture(command, { mirror: true });
        const extra =
          (result.timedOut ? "Aviso: o comando foi encerrado por tempo limite.\n\n" : "") +
          `Comando: ${command}\nCódigo de saída: ${result.code ?? "null"}\n\n` +
          (result.stdout ? `stdout:\n${result.stdout}\n` : "") +
          (result.stderr ? `\nstderr:\n${result.stderr}` : "");

        config = loadConfig();
        const { reply } = await generateAssistantReplyWithFallback(
          config,
          [
            systemMsg,
            {
              role: "user",
              content: `Pedido original em linguagem natural:\n${nextRequest}\n\nResultado da execução:\n\n${extra}`
            }
          ],
          { onModelSwitch }
        );
        config = loadConfig();
        console.log(`\n${reply}\n`);
      } catch (execErr) {
        const errText = execErr instanceof Error ? execErr.message : String(execErr);
        config = loadConfig();
        const { reply } = await generateAssistantReplyWithFallback(
          config,
          [
            systemMsg,
            {
              role: "user",
              content: `Pedido: ${nextRequest}\n\nFalha ao executar o comando sugerido:\n${errText}`
            }
          ],
          { onModelSwitch }
        );
        config = loadConfig();
        console.log(`\n${reply}\n`);
      }

      const { followUp } = await inquirer.prompt<{ followUp: boolean }>([
        {
          type: "confirm",
          name: "followUp",
          message: "Fazer outro pedido nesta sessão?",
          default: false
        }
      ]);
      if (!followUp) return;
      const { text } = await inquirer.prompt<{ text: string }>([
        { type: "input", name: "text", message: "Próximo pedido:" }
      ]);
      nextRequest = (text ?? "").trim();
      if (!nextRequest) return;
    }
  } catch (error) {
    console.error(
      `Falha ao processar pedido: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
