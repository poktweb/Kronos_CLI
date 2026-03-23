#!/usr/bin/env node
import { Command } from "commander";
import { runChatMode } from "./commands/chat.js";
import { runConfigureCommand } from "./commands/configure.js";
import { runDirectRequest } from "./commands/run.js";
import { loadConfig } from "./config.js";

const program = new Command();

program
  .name("kronos")
  .description("Kronos CLI - IA para ajudar no terminal Linux")
  .version("0.1.0");

program
  .command("chat")
  .description("Abrir modo chat interativo")
  .action(async () => {
    await runChatMode();
  });

program
  .command("config")
  .description("Configurar providers e tokens")
  .action(async () => {
    await runConfigureCommand();
  });

program
  .command("run")
  .description('Executar pedido direto. Exemplo: kronos run "instale o npm"')
  .argument("<pedido...>", "Pedido em linguagem natural")
  .action(async (pedidoParts: string[]) => {
    await runDirectRequest(pedidoParts.join(" "));
  });

program
  .argument("[pedido...]", "Pedido direto sem subcomando")
  .action(async (pedidoParts?: string[]) => {
    if (!pedidoParts || pedidoParts.length === 0) {
      await runChatMode();
      return;
    }
    await runDirectRequest(pedidoParts.join(" "));
  });

program.hook("preAction", () => {
  loadConfig();
});

await program.parseAsync(process.argv);
