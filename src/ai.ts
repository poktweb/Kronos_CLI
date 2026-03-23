import type { ChatMessage, ProviderConfig } from "./types.js";

interface OpenAIChatResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
}

export async function generateAssistantReply(
  provider: ProviderConfig,
  messages: ChatMessage[]
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json"
  };

  if (provider.apiKey) {
    headers.Authorization = `Bearer ${provider.apiKey}`;
  }

  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: provider.model,
      messages
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(`Falha na API (${response.status}): ${errorBody}`);
  }

  const data = (await response.json()) as OpenAIChatResponse;
  const content = data.choices?.[0]?.message?.content?.trim();

  if (!content) {
    throw new Error("Resposta da IA vazia.");
  }

  return content;
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
