## Resumo

Refaz o cockpit da obra para facilitar a leitura do avanço, dos prazos e das prioridades. Substitui o mosaico de indicadores repetidos por uma visão executiva com progresso no cabeçalho, quatro indicadores essenciais e gráfico ao lado das pendências.

Branch: `codex/feat/novo-cockpit`, criada a partir de `origin/main`.

## O que foi feito

- Novo cabeçalho com avanço físico circular, datas e prazo contratual; prazo ausente aparece como não informado.
- Resumo com atividades críticas, RNCs, requisições e equipe, respeitando as permissões disponíveis.
- Curva S compacta, painel de prioridades com rolagem, situação por área e atalhos para os módulos.
- Tipografia, espaçamento e cartões renovados nas cinco abas, com adaptações para celular e modo escuro.
- Navegação das abas por teclado e persistência da aba na URL, inclusive após recarregar a página.
- Alterações em `ProjetoDetalhes.jsx`, `CockpitPrimitives.jsx`, `CockpitPlanning.jsx`, `CockpitOperations.jsx` e `Cockpit.css`.

## Validação

- `npm.cmd run build`: aprovado; Vite informa bundle maior que 500 kB.
- `npm.cmd run test:cockpit`: aprovado.
- `git diff --check`: aprovado.
- Navegador com respostas locais simuladas: cinco abas nas larguras de 1440, 768, 390 e 320 pixels sem transbordamento horizontal da página.
- Revisão visual em tema claro, tema escuro e celular; lista de prioridades sem sobreposição.
- Verificados: teclado, recarregamento da aba selecionada, atualização, atalho para RDOs, permissões reduzidas, ausência de dados/datas, falha parcial com nova tentativa e recuperação de erro geral.

## Riscos e pendências

- Backend local indisponível: validação visual e de interação realizada com dados fictícios interceptados exclusivamente no navegador de teste. A integração com dados reais precisa ser conferida no ambiente da aplicação.
- Não há script de lint configurado no frontend.
- PR não publicada.

## Evidências visuais

Capturas com dados de demonstração:

- [Desktop](.playwright-mcp/cockpit-desktop.png)
- [Modo escuro](.playwright-mcp/cockpit-dark.png)
- [Celular](.playwright-mcp/cockpit-mobile.png)
