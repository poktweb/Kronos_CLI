export type ProviderType = "openrouter" | "ollama" | "ollama-cloud";

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface KronosConfig {
  defaultProvider: ProviderType;
  providers: Record<ProviderType, ProviderConfig>;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
