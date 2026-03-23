# Kronos CLI

Kronos CLI e uma IA de terminal para Linux, com dois modos principais:

- `kronos <pedido>`: recebe pedido em linguagem natural, gera comando shell e pede confirmacao para executar.
- `kronos`: abre modo chat interativo dentro do terminal.

Tambem suporta configuracao de providers de IA:

- OpenRouter
- Ollama (local)
- Ollama Cloud

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

## Build

```bash
npm run build
```

## Validar pacote antes de publicar

```bash
npm run pack:check
```

## Publicar no npm

```bash
npm login
npm publish --access public
```

## Uso em desenvolvimento

```bash
npm run dev -- "instale o npm"
```

```bash
npm run dev
```

## Configurar providers

```bash
npm run dev -- config
```

No comando de configuracao, voce define:

- Base URL
- Modelo
- API Key
- Provider padrao

## Comandos

- `kronos`
- `kronos chat`
- `kronos config`
- `kronos run "<pedido>"`

## Observacoes

- A execucao de comandos sempre pede confirmacao.
- O provider precisa estar configurado com endpoint compativel com API estilo OpenAI (`/chat/completions`).
