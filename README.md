# OllieProxy

Um proxy compatível com a API da OpenAI que traduz requisições para o backend da OllieChat. Permite usar qualquer cliente da API OpenAI (SDKs, ferramentas, IDEs) apontando para modelos hospedados na OllieChat.

## Recursos

- **Compatível com OpenAI**: endpoints `POST /v1/chat/completions` e `GET /v1/models`
- **Streaming SSE**: suporte completo a `stream: true` com transformação de chunks
- **Thinking / reasoning**: níveis de raciocínio via sufixo no nome do modelo ou via `reasoning_effort`
- **Tool calls**: repassa `tools` e `tool_choice` para o upstream e acumula tool calls no modo não-streaming
- **Parsing de `[[think]]`**: blocos de raciocínio embutidos no `content` são extraídos para `reasoning_content`
- **Resiliência**: aborta o upstream quando o cliente desconecta, timeout configurável, limite de corpo
- **Health checks**: `GET /health` e `GET /v1/health`

## Requisitos

- Node.js >= 22

## Instalação

```bash
npm install
```

## Uso

### Desenvolvimento

```bash
npm run dev
```

### Produção

```bash
npm run build
npm start
```

O servidor sobe por padrão em `http://0.0.0.0:3000`.

## Configuração

Todas as configurações são via variáveis de ambiente:

| Variável | Padrão | Descrição |
| --- | --- | --- |
| `PORT` | `3000` | Porta de escuta |
| `HOST` | `0.0.0.0` | Host de escuta |
| `UPSTREAM_URL` | `https://olliechat-sw02.onrender.com` | URL base do backend OllieChat |
| `UPSTREAM_TIMEOUT_MS` | `120000` | Timeout da requisição ao upstream (ms) |
| `BODY_LIMIT_BYTES` | `4194304` | Limite de corpo da requisição (bytes) |

## Endpoints

### `POST /v1/chat/completions`

Cria uma conclusão de chat. Compatível com o formato OpenAI.

**Parâmetros suportados:** `model`, `messages`, `stream`, `temperature`, `top_p`, `max_tokens`, `max_completion_tokens`, `stop`, `tools`, `tool_choice`, `reasoning_effort`, `stream_options`, `user`, `presence_penalty`, `frequency_penalty`.

**Limitações:**

- `n > 1` retorna erro 400 (não suportado pelo proxy).
- `logprobs` não é suportado.

#### Exemplo (não-streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-fable-5",
    "messages": [{"role": "user", "content": "Olá"}]
  }'
```

#### Exemplo (streaming)

```bash
curl http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "claude-fable-5",
    "stream": true,
    "messages": [{"role": "user", "content": "Olá"}]
  }'
```

### `GET /v1/models`

Lista os modelos disponíveis, incluindo as variantes com nível de thinking.

### `GET /v1/models/:model`

Retorna os detalhes de um modelo específico.

### `GET /health` e `GET /v1/health`

Retorna `{"status":"ok"}`.

## Níveis de Thinking

Os níveis de raciocínio podem ser definidos de duas formas (com precedência para `reasoning_effort` explícito):

1. **Sufixo no nome do modelo**: `claude-fable-5-max` → thinking `max`
2. **Campo `reasoning_effort`** no corpo da requisição: `"reasoning_effort": "high"`

| Nível | Sufixo do modelo | Valor enviado ao upstream |
| --- | --- | --- |
| `off` | (nenhum) | (omitido) |
| `low` | `-low` | `low` |
| `medium` | `-medium` | `medium` |
| `high` | `-high` | `high` |
| `max` | `-max` | `xhigh` |

## Modelos

Os modelos base disponíveis (cada um exposto também com sufixos `-low`, `-medium`, `-high`, `-max`):

- `claude-fable-5` (anthropic)
- `claude-sonnet-5` (anthropic)
- `claude-opus-4-8` (anthropic)
- `glm-5.2` (zhipu)
- `glm-5.2-fast` (zhipu)
- `deepseek-v4-pro` (deepseek)
- `kimi-k2.7-code` (moonshot)
- `minimax-m3` (minimax)
- `qwen-3.7-plus` (alibaba)

## Estrutura do projeto

```
src/
  index.ts        # Entry point + graceful shutdown
  server.ts       # Instância Fastify, CORS, rotas, health checks
  config.ts       # Configuração via env
  schemas.ts      # Validação Zod das requisições
  routes/
    chat.ts       # /v1/chat/completions (streaming e não-streaming)
    models.ts     # /v1/models
  utils/
    model.ts      # Parse de sufixo de thinking + mapeamento upstream
    stream.ts     # ThinkParser incremental + StreamTransformer
```

## Scripts

| Script | Descrição |
| --- | --- |
| `npm run dev` | Modo desenvolvimento com watch (`tsx watch`) |
| `npm run build` | Compila TypeScript para `dist/` |
| `npm start` | Executa o build de produção |
