import chalk from "chalk";
import prompts from "prompts";
import {
  getConfigPath,
  getEffectiveActiveModel,
  loadConfig,
  MENU_PROVIDERS,
  PROVIDER_LABELS,
  saveConfig
} from "./config.js";
import { runModelsAction } from "./menu-models.js";
import type { RegisteredModel } from "./types.js";
import { ui } from "./ui.js";

let mainMenuBannerAnimatedThisProcess = false;

export async function showMenu(): Promise<void> {
  const active = getEffectiveActiveModel();
  const providerLabel = active
    ? (PROVIDER_LABELS[active.provider as keyof typeof PROVIDER_LABELS] ?? active.provider)
    : "Nenhum";

  console.log("");
  const animateBanner = !mainMenuBannerAnimatedThisProcess;
  if (animateBanner) mainMenuBannerAnimatedThisProcess = true;
  await ui.printBanner({ animate: animateBanner });
  console.log(ui.statusLine(providerLabel, getConfigPath()));
  console.log("");
  console.log(ui.separator());
  console.log("");

  const response = await prompts({
    type: "select",
    name: "action",
    message: "O que deseja fazer?",
    choices: [
      { title: "🔑 Token (OpenRouter) e URL do Ollama (local)", value: "config" },
      { title: "🏠 Casa de API (OpenRouter ou Ollama local)", value: "provider" },
      { title: "🤖 Escolher modelo", value: "models" },
      { title: "❌ Sair", value: "exit" }
    ]
  });

  if (!response.action || response.action === "exit") {
    process.exit(0);
  }

  if (response.action === "models") {
    await handleModelsMenu();
    return;
  }
  if (response.action === "provider") {
    await handleProviderMenu();
    return;
  }
  if (response.action === "config") {
    await handleConfigMenu();
    return;
  }
}

async function handleModelsMenu(providerFilter?: string): Promise<void> {
  let c = loadConfig();
  let allModels = c.registeredModels ?? [];
  if (!Array.isArray(allModels) || allModels.length === 0) {
    c.registeredModels = [
      { provider: "openrouter", id: c.providers.openrouter.model },
      { provider: "ollama", id: c.providers.ollama.model }
    ];
    saveConfig(c);
    allModels = c.registeredModels;
  }
  const active = getEffectiveActiveModel();

  if (providerFilter === undefined) {
    const categoryChoices = [
      ...MENU_PROVIDERS.map((p) => ({
        title: `${active?.provider === p ? "★ " : ""}${PROVIDER_LABELS[p] ?? p}`,
        value: p
      })),
      { title: "➕ Sincronizar modelos (lista da API)", value: "go-sync" as const },
      { title: "🔙 Voltar", value: "back" as const }
    ];
    const cat = await prompts({
      type: "select",
      name: "category",
      message: "Provedor:",
      choices: categoryChoices
    });
    if (cat.category === "back") return showMenu();
    if (cat.category === "go-sync") return handleSyncModelsMenu();
    return handleModelsMenu(cat.category as string);
  }

  let providerModels = allModels.filter((m) => m.provider === providerFilter);
  if (providerModels.length === 0 && providerFilter === "openrouter") {
    await runModelsAction("fetch-openrouter");
    c = loadConfig();
    allModels = c.registeredModels ?? [];
    providerModels = allModels.filter((m) => m.provider === providerFilter);
  }
  if (providerModels.length === 0 && providerFilter === "ollama") {
    await runModelsAction("fetch-ollama");
    c = loadConfig();
    allModels = c.registeredModels ?? [];
    providerModels = allModels.filter((m) => m.provider === providerFilter);
  }
  const label = PROVIDER_LABELS[providerFilter as keyof typeof PROVIDER_LABELS] || providerFilter;

  const choices = [
    ...providerModels.map((m, i) => ({
      title: `${active?.id === m.id && active?.provider === m.provider ? "★ " : ""}${m.id}`,
      value: i
    })),
    ...(providerModels.length === 0
      ? [{ title: "➕ Nenhum modelo — sincronizar lista", value: "go-sync" as const }]
      : []),
    { title: "🔙 Voltar", value: "back-categories" as const }
  ];

  const resp = await prompts({
    type: "select",
    name: "modelIdx",
    message: `${label} — modelo:`,
    choices
  });

  if (resp.modelIdx === "back-categories") return handleModelsMenu();
  if (resp.modelIdx === "go-sync") return handleSyncModelsMenu();

  if (typeof resp.modelIdx === "number") {
    const selected = providerModels[resp.modelIdx] as RegisteredModel;
    c = loadConfig();
    c.activeModel = selected;
    const pt = selected.provider;
    if (pt === "openrouter" || pt === "ollama") {
      c.defaultProvider = pt;
      c.providers[pt] = { ...c.providers[pt], model: selected.id };
    }
    saveConfig(c);
    console.log(ui.success(`Modelo ativo: [${selected.provider}] ${selected.id}\n`));
    return showMenu();
  }
}

async function handleSyncModelsMenu(): Promise<void> {
  const response = await prompts({
    type: "select",
    name: "action",
    message: "Sincronizar modelos de qual fonte?",
    choices: [
      { title: "OpenRouter — buscar lista (API pública)", value: "fetch-openrouter" },
      { title: "Ollama (local) — listar modelos instalados", value: "fetch-ollama" },
      { title: "🔙 Voltar", value: "back" }
    ]
  });

  if (response.action === "back") return handleModelsMenu();

  await runModelsAction(response.action as string);
  return handleSyncModelsMenu();
}

async function handleConfigMenu(): Promise<void> {
  const response = await prompts({
    type: "select",
    name: "type",
    message: "Configuração:",
    choices: [
      { title: "Ver config atual (tokens mascarados)", value: "show" },
      { title: "Token OpenRouter", value: "set-openrouter" },
      { title: "URL base do Ollama (ex: http://localhost:11434)", value: "set-ollama" },
      { title: "🔙 Voltar", value: "back" }
    ]
  });

  if (response.type === "back") return showMenu();
  if (response.type === "show") {
    const c = loadConfig();
    const openrouter = c.providers.openrouter.apiKey;
    const ollama = c.providers.ollama.baseUrl;
    console.log(chalk.blue("\nConfig atual (tokens mascarados):"));
    console.log(ui.dim("  OpenRouter:"), openrouter ? openrouter.slice(0, 8) + "****" : "(não definido)");
    console.log(ui.dim("  Ollama (URL):"), ollama || "(não definido)");
    console.log(ui.dim("  Provider padrão:"), c.defaultProvider);
    console.log(ui.warn("\nArquivo em ~/.kronos — não compartilhe.\n"));
    return handleConfigMenu();
  }

  const msg =
    response.type === "set-openrouter"
      ? "Token OpenRouter:"
      : "URL base do Ollama (sem barra no final):";

  const valueResponse = await prompts({
    type: "text",
    name: "val",
    message: msg
  });

  if (valueResponse.val) {
    const c = loadConfig();
    if (response.type === "set-openrouter") {
      c.providers.openrouter.apiKey = String(valueResponse.val).trim();
    } else if (response.type === "set-ollama") {
      c.providers.ollama.baseUrl = String(valueResponse.val).replace(/\/$/, "");
    }
    saveConfig(c);
    console.log(ui.success("Configuração salva.\n"));
  }

  return handleConfigMenu();
}

async function handleProviderMenu(): Promise<void> {
  const c = loadConfig();
  const models = c.registeredModels ?? [];
  const active = getEffectiveActiveModel();
  const choices = MENU_PROVIDERS.map((p) => ({
    title: `${active?.provider === p ? "★ " : ""}${PROVIDER_LABELS[p] || p}`,
    value: p
  }));
  const response = await prompts({
    type: "select",
    name: "provider",
    message: "Casa de API (provedor ativo):",
    choices: [...choices, { title: "🔙 Voltar", value: "back" }]
  });
  if (response.provider === "back") return showMenu();

  const currentActive = getEffectiveActiveModel();
  const model =
    currentActive?.provider === response.provider
      ? currentActive
      : models.find((m) => m.provider === response.provider);

  if (model) {
    const cfg = loadConfig();
    cfg.activeModel = model;
    const pt = model.provider;
    if (pt === "openrouter" || pt === "ollama") {
      cfg.defaultProvider = pt;
      cfg.providers[pt] = { ...cfg.providers[pt], model: model.id };
    }
    saveConfig(cfg);
    const lab = PROVIDER_LABELS[response.provider as keyof typeof PROVIDER_LABELS] || response.provider;
    console.log(ui.success(`Provedor principal: ${lab}.\n`));
  } else {
    if (response.provider === "openrouter") {
      console.log(ui.error("Nenhum modelo OpenRouter. Use: Escolher modelo → sincronizar OpenRouter."));
    } else {
      console.log(
        ui.error(
          "Nenhum modelo Ollama local. Confira a URL em Configurações e sincronize a lista de modelos."
        )
      );
    }
  }
  return showMenu();
}
