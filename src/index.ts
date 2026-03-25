#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Command } from "commander";

const pkgPath = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkgVersion = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
const cliVersion = pkgVersion.version ?? "0.0.0";

const argv = process.argv.slice(2);

if (argv.length === 0) {
  const { loadConfig } = await import("./config.js");
  const { showMenu } = await import("./menu.js");
  loadConfig();
  await showMenu();
} else {
  const program = new Command();

  program
    .name("kronos")
    .description("Kronos CLI - IA para ajudar no terminal Linux")
    .version(cliVersion);

  program
    .command("chat")
    .description("Abrir modo chat interativo")
    .action(async () => {
      const { runChatMode } = await import("./commands/chat.js");
      await runChatMode();
    });

  program
    .command("config [action]")
    .description("Configurar providers e tokens")
    .option("-v, --value <value>", "Valor da configuração")
    .action(async (action?: string, options?: { value?: string }) => {
      const { runConfigureCommand } = await import("./commands/configure.js");
      await runConfigureCommand(action, options?.value);
    });

  program
    .command("run")
    .description('Executar pedido direto. Exemplo: kronos run "instale o npm"')
    .argument("<pedido...>", "Pedido em linguagem natural")
    .action(async (pedidoParts: string[]) => {
      const { runDirectRequest } = await import("./commands/run.js");
      await runDirectRequest(pedidoParts.join(" "));
    });

  program
    .argument("[pedido...]", "Pedido direto sem subcomando")
    .action(async (pedidoParts?: string[]) => {
      if (!pedidoParts || pedidoParts.length === 0) {
        const { runChatMode } = await import("./commands/chat.js");
        await runChatMode();
        return;
      }
      const { runDirectRequest } = await import("./commands/run.js");
      await runDirectRequest(pedidoParts.join(" "));
    });

  await program.parseAsync(process.argv);
}
