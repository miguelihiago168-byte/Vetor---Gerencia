Documentação — Gestão de Obras - Vetor

Resumo do sistema
- Backend: Node.js + Express, bancos SQLite
- Frontend: React + Vite
- APIs expostas em `/api/*`

Principais funcionalidades
- Gestão de projetos (CRUD)
- EAP (Estrutura Analítica do Projeto) — atividades principais e sub-atividades
- RDO (Relatório Diário de Obra) — preenchimento diário, fotos, anexos, materiais, ocorrências e assinaturas
- RNC — Relatórios de Não Conformidade

APIs relevantes
- `GET /api/projetos` — lista de projetos
- `GET /api/eap/projeto/:id` — atividades EAP do projeto
- `GET /api/rdos/projeto/:id` — lista de RDOs do projeto
- `GET /api/rdos/:id` — obter RDO por id
- Operações de criação/atualização têm endpoints em `/api/rdos`, `/api/eap`, `/api/mao_obra`, etc. Veja `frontend/src/services/api.js` para mapeamento completo.

Mudanças e melhorias aplicadas (interface RDO / EAP)
- `frontend/src/pages/RDOForm.jsx`:
  - Reposicionei a seção de `Assinaturas` para o final do formulário (fluxo natural: preencher → revisar → assinar).
  - Removi o campo de ocorrências duplicado (mantido o formulário estruturado com `título`, `descrição` e `gravidade`).
  - Reposicionei a seção de `Mão de obra` para ficar abaixo das `Condições Climáticas`, com exibição compacta e opção `Editar` para expandir os detalhes (melhora UX e reduz desordem visual).
  - Adicionei seleção de `Trabalhabilidade` para o período `Noite` (Praticável / Impraticável).
  - Lista de atividades foi convertida para uma tabela com barra de progresso, quantidade, % executado e ações (remover / enviar foto).

- `frontend/src/pages/RDOs.jsx`:
  - Modal "Ver" melhorado: exibe tabela clara de atividades com barra de progresso e galeria de fotos do RDO.

- `frontend/src/pages/EAP.jsx`:
  - Cálculo agregado de avanço para atividades principais: se houver sub-atividades, a atividade principal exibe avanço agregado (média ponderada por `percentual_previsto` quando disponível, fallback para média simples).

Checks realizados
- Build do frontend (Vite): gerou `frontend/dist` com sucesso.
- Backend `GET /api/health`: respondeu OK.
- Teste inicial: frontend dev server em `http://localhost:3000/` (Vite ready).

Boas práticas e próximos passos sugeridos
- Adicionar validações client-side mais explícitas (por exemplo, impedir salvar atividade com % inválido).
- Melhorar feedback visual para ações longas (upload de fotos / assinaturas) com skeletons ou toasts.
- Implementar testes automatizados (e2e com Playwright ou Cypress) cobrindo criação de RDO e fluxo de assinatura.

Regras de Integridade (Projeto ↔ EAP ↔ RDO)
- EAP requer Projeto: `atividades_eap.projeto_id` é obrigatório (FK com `ON DELETE CASCADE`).
- RDO requer EAP: criação de RDO é bloqueada se o projeto não tiver nenhuma atividade EAP.
- RDO deve conter atividades: não é permitido alterar status de um RDO sem atividades vinculadas.
- Consistência de Projeto: cada `rdo_atividades` deve referenciar uma `atividade_eap` do mesmo `projeto_id` do RDO.

Implementação técnica
- Banco: triggers SQLite garantem as regras acima.
- API: validações adicionais em `POST /api/rdos` e `PATCH /api/rdos/:id/status` reforçam a integridade.
- Índices: adicionados em `atividades_eap(projeto_id,pai_id)`, `rdos(projeto_id,data_relatorio)` e `rdo_atividades(rdo_id, atividade_eap_id)` para consultas e relatórios.

Se desejar, posso:
- Gerar screenshots automáticos das telas (usando Puppeteer) para documentação visual.
- Criar `docker-compose.yml` para facilitar execução local.
- Ajustar estilos (cores/spacings) conforme guia de design.
