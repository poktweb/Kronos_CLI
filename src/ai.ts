import type { ChatMessage, ProviderConfig } from "./types.js";

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
  provider: ProviderConfig,
  userMessage: string,
  hostSummary?: string
): Promise<boolean> {
  const envLine = hostSummary ? ` Ambiente: ${hostSummary}.` : "";
  const systemPrompt =
    "Você classifica se o usuário pede para EXECUTAR no computador dele um comando de terminal, ferramenta externa (ex.: nmap, ping, curl) ou obter saída real do sistema. " +
    "Perguntas puramente teóricas, tutoriais sem pedir execução, ou conversa casual: needs_shell=false. " +
    "Responda APENAS JSON válido, uma linha: {\"needs_shell\":true} ou {\"needs_shell\":false}." +
    envLine;

  const raw = await generateAssistantReply(provider, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ]);
  const parsed = parseNeedsShellJson(raw);
  if (parsed !== null) return parsed;
  return /needs_shell\s*:\s*true/i.test(raw);
}
