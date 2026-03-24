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
  request: string
): Promise<string> {
  const systemPrompt =
    "Você é o Kronos CLI, especialista em Linux. Gere APENAS um comando shell seguro e direto, sem markdown, sem explicações e sem crases. Se a solicitação for ambígua, retorne um comando de diagnóstico curto.";

  return generateAssistantReply(provider, [
    { role: "system", content: systemPrompt },
    { role: "user", content: request }
  ]);
}
