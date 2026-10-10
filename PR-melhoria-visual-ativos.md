## Resumo

Padroniza o módulo inteiro de Ativos: visão geral, cadastro, retirada, devolução, manutenção, perdas e relatórios. Indicadores e custos formam resumos compactos; formulários têm seções e rótulos permanentes; tabelas agrupam identificação, disponibilidade e histórico. No celular, cada registro é apresentado em um bloco com rótulos.

Branch: `codex/feat/melhoria-visual-ativos`, criada a partir de `origin/main`.

## O que foi feito

- Navegação com ícones, indicação da seção atual e rolagem horizontal em telas menores.
- Cabeçalhos com descrição e ações principais; indicadores e custos com hierarquia visual consistente.
- Busca por ativo ou colaborador e filtro de status nas alocações, com contagem de resultados.
- Inventário reorganizado em cinco colunas, preservando código, nome, categoria, marca, modelo, NF, quantidades, reposição e transferência.
- Cadastro dividido em identificação, estoque/aquisição e calibração, com rótulos permanentes, campos obrigatórios indicados e estado de salvamento.
- Estados de carregamento, ausência de resultados e erro com nova tentativa; cores adaptadas aos temas claro e escuro.
- Retirada organizada por responsável e ativo/prazo, com seleção de pessoas por teclado, indicação de saldo e atualização da disponibilidade após registrar.
- Devolução e manutenção com busca, status e ações organizadas; modais de baixa, envio, detalhes e descarte seguem a mesma apresentação.
- Perdas com resumo de ocorrências, quantidades e custo acumulado. Histórico de movimentações com busca e filtro por tipo; identificação, origem, destino e responsáveis permanecem disponíveis.
- Componentes compartilhados para painéis, tabelas, busca, estados e modais. Modais contêm o foco, fecham com Escape e restauram o foco e a rolagem ao sair.
- A navegação horizontal mantém a seção atual visível no celular.
- Alterações em `AlmoxarifadoLayout.jsx`, `Almoxarifado.css`, novo `AlmoxarifadoUI.jsx` e nas sete páginas `Almox*` do módulo.

## Validação

- `npm.cmd run build`: aprovado; permanece o aviso do Vite sobre bundle acima de 500 kB.
- `git diff --check`: aprovado.
- Navegador com respostas simuladas: visão geral e inventário verificados em 1440, 1024, 768, 390 e 320 pixels, sem transbordamento do módulo ou corte do conteúdo das tabelas.
- Revisão visual de visão geral, inventário e formulário, nos temas claro e escuro e no celular.
- Verificados busca, filtros, limpeza de resultados, erros com nova tentativa e estados vazios.
- Cadastro: obrigatoriedade dos campos, código automático e código inicial personalizado, conversão de moeda e envio dos campos de calibração.
- Transferência: bloqueio para ativos alocados, cancelamento da confirmação e envio da obra de destino.
- Retirada, devolução, manutenção, perdas e relatórios: verificação visual com dados em 1440, 1024, 768, 390 e 320 pixels, incluindo temas claro e escuro e modais responsivos.
- Retirada: pessoa cadastrada por teclado, colaborador manual, limite de saldo e conteúdo da requisição.
- Devolução: quantidade pendente, devolução parcial, perda, encaminhamento de item danificado à manutenção e baixa definitiva com justificativa.
- Manutenção: campos obrigatórios, prazo, conversão monetária, retirada, detalhes, retorno ao estoque e descarte justificado; verificados foco por Tab/Shift+Tab, fechamento com Escape e restauração do foco.
- Perdas e relatórios: totais acumulados, busca por NF e destino, filtro por tipo, datas, ausência de resultados e limpeza de filtros.
- Nas cinco páginas operacionais, verificados erro de carregamento, nova tentativa e estado sem registros.
- Conferência final da navegação em 390 e 320 pixels: a seção selecionada permanece inteiramente visível, inclusive após o carregamento das fontes. Visão geral e cadastro conferidos novamente em 1440 e 320 pixels após os ajustes compartilhados.

## Riscos e pendências

- A validação de navegador usou dados fictícios e requisições interceptadas exclusivamente no navegador de teste. A persistência e a integração com dados reais não foram exercitadas.
- Não há script de lint configurado no frontend. Os testes específicos de cockpit e agenda não foram executados porque esses módulos não foram alterados.
- PR não publicada.

