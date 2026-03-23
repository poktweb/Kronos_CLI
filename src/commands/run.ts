import inquirer from "inquirer";
import { suggestLinuxCommand } from "../ai.js";
import { loadConfig } from "../config.js";
import { runCommand } from "../shell.js";

export async function runDirectRequest(request: string): Promise<void> {
  const config = loadConfig();
  const provider = config.providers[config.defaultProvider];

  try {
    const command = await suggestLinuxCommand(provider, request);
    console.log(`Comando sugerido: ${command}`);

    const { execute } = await inquirer.prompt<{ execute: boolean }>([
      {
        type: "confirm",
        name: "execute",
        message: "Deseja executar esse comando?",
        default: true
      }
    ]);

    if (!execute) {
      console.log("Execução cancelada.");
      return;
    }

    const code = await runCommand(command);
    if (code !== 0) {
      console.log(`Comando finalizado com código ${code}.`);
    }
  } catch (error) {
    console.error(
      `Falha ao processar pedido: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
