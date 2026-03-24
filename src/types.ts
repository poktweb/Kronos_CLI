export type ProviderType = "openrouter" | "ollama" | "ollama-cloud";

/** Provedores do menu (paridade com Pokt_CLI) */
export type MenuProvider =
  | "openai"
  | "grok"
  | "openrouter"
  | "ollama"
  | "ollama-cloud"
  | "gemini"
  | "controller";

export interface ProviderConfig {
  type: ProviderType;
  name: string;
  baseUrl: string;
  model: string;
  apiKey?: string;
  siteUrl?: string;
  appName?: string;
}

export interface RegisteredModel {
  provider: string;
  id: string;
}

export interface ActiveModel {
  provider: string;
  id: string;
}

export interface McpServerConfig {
  name: string;
  type: "stdio" | "http";
  command?: string;
  args?: string[];
  url?: string;
  httpTransport?: "streamable-http" | "sse";
  headers?: Record<string, string>;
  env?: Record<string, string>;
  oauth?: boolean;
  source?: "project" | "global";
}

export interface KronosConfig {
  defaultProvider: ProviderType;
  providers: Record<ProviderType, ProviderConfig>;
  /** Modelos registrados (menu idêntico ao Pokt_CLI) */
  registeredModels?: RegisteredModel[];
  activeModel?: ActiveModel | null;
  mcpServers?: McpServerConfig[];
  poktToken?: string;
  openaiApiKey?: string;
  grokApiKey?: string;
  geminiApiKey?: string;
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}
