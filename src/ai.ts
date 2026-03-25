import { persistActiveModelIfChanged } from "./config.js";
import type { ChatMessage, KronosConfig, ProviderConfig, ProviderType } from "./types.js";

const RUNTIME_PROVIDERS: readonly ProviderType[] = ["openrouter", "ollama", "ollama-cloud"];

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

interface OllamaChatResponse {
  message?: {
    content?: string;
  };
}

function buildUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

async function callOpenRouter(
  provider: ProviderConfig,
  messages: ChatMessage[]
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }
  if (provider.siteUrl) {
    headers["HTTP-Referer"] = provider.siteUrl;
  }
  if (provider.appName) {
    headers["X-OpenRouter-Title"] = provider.appName;
  }

  const response = await fetch(buildUrl(provider.baseUrl, "/api/v1/chat/completions"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages
    })
  });

  if (!response.ok) {
    throw new Error(`Falha OpenRouter (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Resposta vazia do OpenRouter.");
  return content;
}

async function callOllama(
  provider: ProviderConfig,
  messages: ChatMessage[]
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (provider.type === "ollama-cloud" && provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const response = await fetch(buildUrl(provider.baseUrl, "/api/chat"), {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages,
      stream: false
    })
  });

  if (!response.ok) {
    throw new Error(`Falha Ollama (${response.status}): ${await response.text()}`);
  }

  const data = (await response.json()) as OllamaChatResponse;
  const content = data.message?.content?.trim();
  if (!content) throw new Error("Resposta vazia do Ollama.");
  return content;
}

export async function generateAssistantReply(
  provider: ProviderConfig,
  messages: ChatMessage[]
): Promise<string> {
  if (provider.type === "openrouter") {
    return callOpenRouter(provider, messages);
  }
  return callOllama(provider, messages);
}

function providerConfigForModel(
  config: KronosConfig,
  provider: ProviderType,
  modelId: string
): ProviderConfig | null {
  const base = config.providers[provider];
  if (!base) return null;
  return { ...base, model: modelId };
}

/** Ordem: modelo ativo, depois demais entradas de `registeredModels` (sem duplicar). */
function buildModelFallbackQueue(config: KronosConfig): Array<{
  provider: ProviderType;
  modelId: string;
}> {
  const out: Array<{ provider: ProviderType; modelId: string }> = [];
  const seen = new Set<string>();
  const add = (p: string, id: string) => {
    if (!RUNTIME_PROVIDERS.includes(p as ProviderType)) return;
    const key = `${p}:${id}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ provider: p as ProviderType, modelId: id });
  };

  if (
    config.activeModel &&
    RUNTIME_PROVIDERS.includes(config.activeModel.provider as ProviderType)
  ) {
    add(config.activeModel.provider, config.activeModel.id);
  } else {
    const dp = config.defaultProvider;
    add(dp, config.providers[dp].model);
  }

  for (const m of config.registeredModels ?? []) {
    add(m.provider, m.id);
  }

  return out;
}

/** Evita tratar uma linha de comando shell como “recusa” do modelo. */
function looksLikeShellCommandLine(text: string): boolean {
  const t = text.trim();
  const first = t.split(/\r?\n/)[0]?.trim() ?? "";
  if (!first || t.length > 4096) return false;
  if (/\b(sorry|cannot|can't|não\s+posso|desculpe)\b/i.test(first) && first.length > 40) {
    return false;
  }
  if (
    /^(?:sudo\s+)?(?:\/|\.\/|\.\.\/|[a-zA-Z_][\w.-]*)(\s|[/\\]|$)/.test(first) &&
    first.length < 2000 &&
    !/^[A-Za-z\s,.'’`]+[.!?]$/.test(first)
  ) {
    return true;
  }
  return false;
}

/**
 * Detecta respostas em que o modelo declara não poder ajudar (política, recusa genérica, etc.).
 * Inglês e português; ignora texto que pareça um comando shell.
 */
export function isModelRefusalResponse(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  if (looksLikeShellCommandLine(t)) return false;
  const lower = t.toLowerCase();
  const patterns: RegExp[] = [
    /i['']?m\s+sorry[,\s]+but\s+i\s+(can['']?t|cannot)\s+(help|assist)/i,
    /sorry[,\s]+but\s+i\s+(can['']?t|cannot)\s+(help|assist)/i,
    /i['']?m\s+sorry[,\s]+i\s+(can['']?t|cannot)\s+help/i,
    /i\s+(can['']?t|cannot)\s+help\s+with\s+(that|this)/i,
    /i\s+cannot\s+(assist|help)\s+with/i,
    /i['']?m\s+not\s+able\s+to\s+help/i,
    /i['']?m\s+unable\s+to\s+(help|assist)/i,
    /as\s+an\s+ai\s+(language\s+)?model,?\s+i\s+(can['']?t|cannot|must\s+not)/i,
    /cannot\s+comply\s+with\s+that\s+request/i,
    /this\s+request\s+(can['']?t|cannot)\s+be\s+completed/i,
    /não\s+posso\s+ajudar/i,
    /não\s+consigo\s+ajudar/i,
    /não\s+posso\s+(fornecer|atender|cumpr)/i,
    /desculpe,?\s+mas\s+não\s+posso/i,
    /against\s+(my\s+)?(content\s+)?policy/i,
    /violat(es|ing)\s+(my\s+)?(?:ethical|usage|safety)\s+guidelines/i
  ];
  return patterns.some((p) => p.test(lower) || p.test(t));
}

export async function generateAssistantReplyWithFallback(
  config: KronosConfig,
  messages: ChatMessage[],
  opts?: {
    onModelSwitch?: (from: string, to: string) => void;
    persistOnSuccess?: boolean;
  }
): Promise<{ reply: string; usedProvider: ProviderType; usedModel: string }> {
  const queue = buildModelFallbackQueue(config);
  if (queue.length === 0) {
    throw new Error("Nenhum modelo configurado para tentar.");
  }

  let lastRefusal: { text: string; provider: ProviderType; modelId: string } | null = null;
  let lastError: unknown;
  let prevLabel: string | null = null;

  for (const { provider, modelId } of queue) {
    const pc = providerConfigForModel(config, provider, modelId);
    if (!pc) continue;
    const label = `${provider}/${modelId}`;
    if (prevLabel !== null) {
      opts?.onModelSwitch?.(prevLabel, label);
    }
    prevLabel = label;

    try {
      const content = await generateAssistantReply(pc, messages);
      if (!isModelRefusalResponse(content)) {
        if (opts?.persistOnSuccess !== false) {
          persistActiveModelIfChanged(provider, modelId);
        }
        return { reply: content, usedProvider: provider, usedModel: modelId };
      }
      lastRefusal = { text: content, provider, modelId };
    } catch (err) {
      lastError = err;
    }
  }

  if (lastRefusal) {
    return {
      reply: lastRefusal.text,
      usedProvider: lastRefusal.provider,
      usedModel: lastRefusal.modelId
    };
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Nenhum modelo respondeu.");
}

export async function suggestLinuxCommandWithFallback(
  config: KronosConfig,
  request: string,
  hostSummary?: string,
  opts?: { onModelSwitch?: (from: string, to: string) => void }
): Promise<string> {
  const envLine = hostSummary
    ? ` Ambiente onde o comando será executado: ${hostSummary}. Use sintaxe, caminhos e gerenciador de pacotes adequados a este sistema (não assuma apenas Debian/Ubuntu se for outro).`
    : "";

  const systemPrompt =
    "Você é o Kronos CLI, especialista em linha de comando (Linux, macOS, Windows shell). Gere APENAS um comando shell seguro e direto, sem markdown, sem explicações e sem crases. Se a solicitação for ambígua, retorne um comando de diagnóstico curto." +
    envLine;

  const { reply } = await generateAssistantReplyWithFallback(
    config,
    [
      { role: "system", content: systemPrompt },
      { role: "user", content: request }
    ],
    opts
  );
  return reply;
}

export async function suggestLinuxCommand(
  provider: ProviderConfig,
  request: string,
  hostSummary?: string
): Promise<string> {
  const envLine = hostSummary
    ? ` Ambiente onde o comando será executado: ${hostSummary}. Use sintaxe, caminhos e gerenciador de pacotes adequados a este sistema (não assuma apenas Debian/Ubuntu se for outro).`
    : "";

  const systemPrompt =
    "Você é o Kronos CLI, especialista em linha de comando (Linux, macOS, Windows shell). Gere APENAS um comando shell seguro e direto, sem markdown, sem explicações e sem crases. Se a solicitação for ambígua, retorne um comando de diagnóstico curto." +
    envLine;

  return generateAssistantReply(provider, [
    { role: "system", content: systemPrompt },
    { role: "user", content: request }
  ]);
}

/** Heurística leve para evitar chamadas extras à API em conversas que claramente não pedem execução local. */
export function quickShellExecutionHint(message: string): boolean {
  const m = message.toLowerCase();
  const patterns: RegExp[] = [
    /\b(nmap|masscan|ping|curl|wget|traceroute|tracert|dig|nslookup|netstat|ss\b|arp\b|tcpdump|wireshark)\b/i,
    /\b(powershell|pwsh|cmd\.exe|bash|zsh|sh\b)\b/i,
    /\b(run|execute|executar?|rodar|varredura|rastrear|escanear|scan)\b/i,
    /\b(portas?\s+abertas?|abrir\s+porta)\b/i,
    /\b(me\s+)?(mostre|retorne|traga|liste|dê)\b.*\b(saída|resultado|output)\b/i
  ];
  return patterns.some((p) => p.test(m));
}

function parseNeedsShellJson(raw: string): boolean | null {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();
  const objectMatch = candidate.match(/\{[\s\S]*\}/);
  const jsonStr = objectMatch ? objectMatch[0] : candidate;
  try {
    const parsed = JSON.parse(jsonStr) as { needs_shell?: boolean };
    if (typeof parsed.needs_shell === "boolean") return parsed.needs_shell;
  } catch {
    // ignore
  }
  return null;
}

/**
 * Classifica se o usuário pede execução real de comando/ferramenta no sistema local.
 */
export async function detectShellExecutionIntent(
  config: KronosConfig,
  userMessage: string,
  hostSummary?: string
): Promise<boolean> {
  const envLine = hostSummary ? ` Ambiente: ${hostSummary}.` : "";
  const systemPrompt =
    "Você classifica se o usuário pede para EXECUTAR no computador dele um comando de terminal, ferramenta externa (ex.: nmap, ping, curl) ou obter saída real do sistema. " +
    "Perguntas puramente teóricas, tutoriais sem pedir execução, ou conversa casual: needs_shell=false. " +
    "Responda APENAS JSON válido, uma linha: {\"needs_shell\":true} ou {\"needs_shell\":false}." +
    envLine;

  const { reply: raw } = await generateAssistantReplyWithFallback(config, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ]);
  const parsed = parseNeedsShellJson(raw);
  if (parsed !== null) return parsed;
  return /needs_shell\s*:\s*true/i.test(raw);
}
