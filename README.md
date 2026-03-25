# Kronos CLI

Kronos CLI e uma IA de terminal para Linux, com dois modos principais:

- `kronos <pedido>`: recebe pedido em linguagem natural, gera comando shell e pede confirmacao para executar.
- `kronos`: abre modo chat interativo dentro do terminal.

Tambem suporta configuracao de providers de IA:

- OpenRouter
- Ollama (local)
- Ollama Cloud

## Providers e endpoints usados

- `OpenRouter`: `https://openrouter.ai/api/v1/chat/completions`
- `Ollama local`: `http://localhost:11434/api/chat`
- `Ollama Cloud`: `https://ollama.com/api/chat` (com `Authorization: Bearer <OLLAMA_API_KEY>`)

No OpenRouter, voce pode configurar tambem os headers opcionais:

- `HTTP-Referer`
- `X-OpenRouter-Title`

## Instalar dependencias

```bash
npm install
```

## Instalar globalmente (npm)

Depois de publicar no npm:

```bash
npm install -g kronos-cli
```

Uso:

```bash
kronos
```

```bash
kronos "instale o npm"
```

Fluxo interativo (lista para selecionar provider):

- API Key
- Provider padrao

Tambem aceita acao direta (estilo Pokt_CLI):

```bash
kronos config show
kronos config set-openrouter -v <OPENROUTER_API_KEY>
kronos config set-ollama-cloud -v <OLLAMA_API_KEY>
kronos config clear-openrouter
kronos config clear-ollama-cloud
```

## Comandos

- `kronos`
- `kronos chat`
- `kronos config`
- `kronos run "<pedido>"`

## Observacoes

- A execucao de comandos sempre pede confirmacao.
- O provider precisa estar configurado com endpoint compativel com API estilo OpenAI (`/chat/completions`).
