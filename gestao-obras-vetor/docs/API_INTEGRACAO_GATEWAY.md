# API de Integração — Gateway Vetor

**Versão:** 1.0  
**Protocolo:** HTTPS + JSON  
**Autenticação:** OAuth 2.0 Client Credentials  
**Público:** aplicações servidor-a-servidor e gateways de integração

Esta documentação é o contrato técnico para integrar uma aplicação externa ao Vetor. Não é necessário — nem permitido — usar login, senha ou sessão de uma pessoa.

## 1. Pré-requisitos

O responsável pela integração deve receber, por canal seguro:

- `client_id`, no formato `sa_...`;
- `client_secret`, exibido uma única vez na criação da service account;
- URL base da API: `https://vetor.damjam.com.br`.

Armazene o `client_secret` em cofre de segredos ou variável segura do servidor do gateway. Nunca o envie para navegador, aplicativo móvel, repositório Git, log ou ferramenta de atendimento.

> A API deve ser chamada somente por HTTPS. Não há autenticação por usuário comum para esta integração.

## 2. Visão geral do fluxo

1. O gateway solicita um access token em `POST /api/oauth/token`.
2. A API devolve um token Bearer com validade de uma hora.
3. O gateway mantém o token somente em memória e o envia em chamadas autenticadas.
4. Cinco minutos antes da expiração, o gateway solicita outro token automaticamente.
5. Em um `401`, o gateway descarta o token, solicita um novo e repete a operação original uma única vez.

Não existe tela de login, refresh token ou ação do usuário final nesse fluxo.

## 3. Endpoints

| Método | Rota | Autenticação | Finalidade |
| --- | --- | --- | --- |
| `POST` | `/api/oauth/token` | `client_id` + `client_secret` | Emitir access token. |
| `GET` | `/api/auth/service/session` | Bearer access token | Validar token e obter a identidade técnica. |

URL base oficial: `https://vetor.damjam.com.br`.

## 4. Emitir access token

### `POST /api/oauth/token`

**URL completa:**

```text
https://vetor.damjam.com.br/api/oauth/token
```

**Headers obrigatórios:**

```http
Content-Type: application/x-www-form-urlencoded
```

**Corpo obrigatório:**

```text
grant_type=client_credentials
```

Envie as credenciais de somente uma das formas abaixo.

### Opção A — HTTP Basic (preferencial)

```http
Authorization: Basic Base64(client_id:client_secret)
```

Exemplo com `curl`:

```bash
curl --request POST 'https://vetor.damjam.com.br/api/oauth/token' \
  --user "$CLIENT_ID:$CLIENT_SECRET" \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data 'grant_type=client_credentials'
```

### Opção B — Formulário URL-encoded

```bash
curl --request POST 'https://vetor.damjam.com.br/api/oauth/token' \
  --header 'Content-Type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode "client_id=$CLIENT_ID" \
  --data-urlencode "client_secret=$CLIENT_SECRET"
```

Não envie HTTP Basic e `client_id`/`client_secret` no corpo na mesma chamada.

### Resposta de sucesso — `200 OK`

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "Bearer",
  "expires_in": 3600
}
```

| Campo | Tipo | Descrição |
| --- | --- | --- |
| `access_token` | string | Token a ser enviado no header `Authorization`. Trate-o como credencial secreta. |
| `token_type` | string | Sempre `Bearer`. |
| `expires_in` | number | Tempo de vida em segundos; atualmente `3600`. |

As respostas do endpoint de token incluem `Cache-Control: no-store` e não devem ser armazenadas em cache, banco de dados ou logs.

## 5. Usar e validar o token

Inclua o token em toda rota de integração protegida:

```http
Authorization: Bearer <access_token>
```

### `GET /api/auth/service/session`

Esta rota serve para testar a configuração e validar a identidade da service account. Ela não expõe dados de negócio.

```bash
curl 'https://vetor.damjam.com.br/api/auth/service/session' \
  --header "Authorization: Bearer $ACCESS_TOKEN"
```

Resposta de sucesso — `200 OK`:

```json
{
  "service_account": {
    "client_id": "sa_exemplo",
    "name": "Gateway ERP"
  },
  "token": {
    "type": "service_access",
    "issued_at": "2026-07-30T12:00:00.000Z",
    "expires_at": "2026-07-30T13:00:00.000Z"
  }
}
```

O token é específico para service accounts. Ele não autentica rotas de usuários, não representa uma pessoa e, nesta versão, não concede acesso a tenant ou dados de negócio.

## 6. Erros e tratamento esperado

| HTTP | `error`/`codigo` | Significado | Ação do gateway |
| --- | --- | --- | --- |
| `400` | `invalid_request` | Content-Type, campos ou combinação de credenciais inválida. | Corrigir a requisição; não repetir automaticamente. |
| `400` | `unsupported_grant_type` | `grant_type` diferente de `client_credentials`. | Corrigir a integração. |
| `401` | `invalid_client` | Credencial inválida, inativa ou malformada. | Não repetir; verificar/rotacionar a credencial com o administrador. |
| `401` | `SERVICE_TOKEN_REQUIRED` | Header Bearer ausente. | Obter token e reenviar a chamada. |
| `401` | `SERVICE_TOKEN_INVALID` | Token expirado, inválido, revogado ou de tipo incorreto. | Renovar token e repetir a chamada original uma vez. |
| `429` | `temporarily_unavailable` | Muitas falhas de autenticação pela mesma origem. | Respeitar `Retry-After` antes de tentar novamente. |
| `503` | `temporarily_unavailable` ou `SERVICE_AUTH_UNAVAILABLE` | Serviço indisponível temporariamente. | Retentar com backoff exponencial; não pedir login ao usuário. |

Para `401` em uma chamada de negócio, faça no máximo uma renovação e uma repetição. Persistir em tentativas evita recuperação e pode acionar o rate limit.

## 7. Implementação recomendada no gateway

Mantenha `accessToken`, `expiresAt` e uma única promessa de renovação em memória. O exemplo abaixo usa `fetch` nativo do Node.js 18+:

```javascript
const baseUrl = 'https://vetor.damjam.com.br';
const clientId = process.env.VETOR_CLIENT_ID;
const clientSecret = process.env.VETOR_CLIENT_SECRET;

let accessToken = null;
let expiresAt = 0;
let refreshInFlight = null;

async function getAccessToken() {
  const renewAt = expiresAt - 5 * 60 * 1000;
  if (accessToken && Date.now() < renewAt) return accessToken;
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const basic = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
    const response = await fetch(`${baseUrl}/api/oauth/token`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${basic}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials'
    });

    if (!response.ok) throw new Error(`Falha ao obter token: HTTP ${response.status}`);
    const token = await response.json();
    accessToken = token.access_token;
    expiresAt = Date.now() + token.expires_in * 1000;
    return accessToken;
  })();

  try {
    return await refreshInFlight;
  } finally {
    refreshInFlight = null;
  }
}

async function vetorRequest(path, options = {}) {
  const execute = async () => fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${await getAccessToken()}`
    }
  });

  let response = await execute();
  if (response.status !== 401) return response;

  accessToken = null;
  expiresAt = 0;
  response = await execute();
  return response;
}
```

Em produção, acrescente timeout de rede, backoff exponencial para respostas `503`, observabilidade sem registrar tokens e proteção de segredos no gerenciador de configuração escolhido.

### Exemplo em Python

Instale a dependência HTTP:

```bash
pip install requests
```

```python
import os
import time
import requests

BASE_URL = "https://vetor.damjam.com.br"
CLIENT_ID = os.environ["VETOR_CLIENT_ID"]
CLIENT_SECRET = os.environ["VETOR_CLIENT_SECRET"]

access_token = None
expires_at = 0


def get_access_token():
    global access_token, expires_at

    # Renova cinco minutos antes de expirar.
    if access_token and time.time() < expires_at - 5 * 60:
        return access_token

    response = requests.post(
        f"{BASE_URL}/api/oauth/token",
        auth=(CLIENT_ID, CLIENT_SECRET),
        headers={"Content-Type": "application/x-www-form-urlencoded"},
        data={"grant_type": "client_credentials"},
        timeout=15,
    )
    response.raise_for_status()

    token = response.json()
    access_token = token["access_token"]
    expires_at = time.time() + token["expires_in"]
    return access_token


def vetor_request(method, path, **kwargs):
    global access_token, expires_at
    request_kwargs = dict(kwargs)
    base_headers = dict(request_kwargs.pop("headers", {}))

    def send():
        headers = dict(base_headers)
        headers["Authorization"] = f"Bearer {get_access_token()}"
        return requests.request(
            method, f"{BASE_URL}{path}", headers=headers, timeout=15, **request_kwargs
        )

    response = send()
    if response.status_code != 401:
        return response

    # Faz uma única renovação e repetição após token inválido/expirado.
    access_token = None
    expires_at = 0
    return send()


# Validação da integração:
response = vetor_request("GET", "/api/auth/service/session")
response.raise_for_status()
print(response.json())
```

O exemplo deve ser executado em um servidor. Configure `VETOR_CLIENT_ID` e
`VETOR_CLIENT_SECRET` como variáveis seguras do ambiente ou via cofre de segredos.

## 8. Ciclo de vida da credencial

Somente administradores do Vetor criam, listam, rotacionam ou desativam service accounts. Esses comandos não fazem parte da API pública para terceiros.

| Evento | Efeito para o gateway |
| --- | --- |
| Criação | Recebe `client_id` e `client_secret` uma única vez. |
| Rotação | O segredo anterior deixa de funcionar; tokens emitidos antes são invalidados. Atualize o cofre do gateway. |
| Desativação | Novas emissões e tokens existentes deixam de funcionar imediatamente. |

Ao receber `401 invalid_client` após uma rotação, não use fallback de usuário comum: solicite a nova credencial ao administrador responsável.

## 9. Escopo atual e compatibilidade

- A versão atual entrega apenas emissão e validação de token.
- Não há endpoint público para enviar, consultar ou alterar dados de negócio ainda.
- A conta não possui escopo de tenant por enquanto.
- Novas rotas de integração serão documentadas neste mesmo contrato com método, URL, payload, autorização, limites e exemplos antes de serem disponibilizadas.

## 10. Checklist de homologação

- [ ] Credenciais recebidas por canal seguro e armazenadas no cofre do gateway.
- [ ] Chamada a `POST /api/oauth/token` retorna `200`.
- [ ] Chamada a `GET /api/auth/service/session` retorna o `client_id` esperado.
- [ ] Renovação ocorre automaticamente antes dos cinco minutos finais.
- [ ] Um `401` força somente uma renovação e uma repetição.
- [ ] Logs do gateway não contêm `client_secret` ou `access_token`.
- [ ] Ambiente de homologação usa credenciais diferentes das de produção.
