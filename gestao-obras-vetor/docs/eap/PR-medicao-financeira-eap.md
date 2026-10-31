# Medição financeira das atividades da EAP

Branch: `codex/feat/medicao-financeira-eap` · Base: `origin/main` (`1726a05`).

## Resumo

A EAP passa a cadastrar o valor total de cada atividade e calcular a medição financeira pela execução dos RDOs atualmente aprovados. Uma atividade de R$ 10.000 com 30% de execução aprovada apresenta R$ 3.000 medidos e R$ 7.000 de saldo.

O preço é opcional, e os agrupadores consolidam somente as atividades sem filhos. Atividades sem preço ficam identificadas, e os totais incompletos aparecem como parciais.

## O que foi feito

- Campo de preço na edição em linha, no painel e no formulário, com entrada em reais, validação de duas casas decimais e distinção entre preço zero e ausência de preço.
- Colunas de valor previsto e medido, saldo no painel e resumo financeiro do projeto independente dos filtros.
- Serviço que consulta os RDOs aprovados diretamente, sem depender do percentual em cache da EAP. Usa quantidade executada/prevista quando há quantidade prevista positiva; caso contrário, soma os percentuais aprovados. Limita a execução a 0–100% e arredonda o valor por atividade para centavos antes da consolidação.
- Cálculo decimal com centavos e frações inteiras. Reversões, correções e exclusões de RDOs são refletidas na próxima consulta; a reaprovação não duplica valores.
- Mudanças no preço aplicam o valor atual a toda a execução aprovada, incluindo RDOs anteriores. A interface confirma esse efeito, e a auditoria existente registra a edição.
- Edições exclusivamente monetárias enviam apenas o preço e não recalculam nem reescrevem o avanço físico dos RDOs. O PUT também preserva quantidade e preço omitidos.
- Preços próprios de agrupadores não são editáveis nem somados. Um valor anteriormente cadastrado fica preservado, mas só participa da medição enquanto a atividade não possui filhos.
- Cópia de EAP preserva preços. A importação Excel mantém o formato atual e cria atividades sem preço.

### Contrato e banco

- Migration `000025_eap_valor_medicao`: coluna nullable `valor_total_medicao NUMERIC(15,2)` em `atividades_eap`, com limite não negativo. A migration não preenche preços nem altera RDOs existentes.
- POST/PUT aceitam `valor_total_medicao` como número ou decimal com ponto; ausência no PUT preserva o preço, e `null` o remove. O frontend aceita a notação brasileira e normaliza o envio.
- GET da EAP retorna `valor_total_medicao` e `medicao: { valor_previsto, valor_medido, saldo, atividades_sem_valor }` em cada atividade. Valores financeiros de folhas sem preço são `null`; agrupadores somam apenas as folhas precificadas e informam quantas estão pendentes.
- Consulta de execução restringe projeto e tenant tanto nos RDOs quanto nas atividades, além do isolamento existente do banco.
- Aplicar a migration antes de disponibilizar o backend atualizado em outros ambientes. No PostgreSQL local ela já foi aplicada; `migrate:status` confirmou zero migrations pendentes.

## Validação

- Backend: `npm.cmd run test:eap-medicao` — passou. Cobre fórmulas, percentual, limites, precisão, arredondamento, hierarquia, preço opcional e classificação da edição.
- Backend: `npm.cmd run test:eap-medicao-db` — passou. Exercita SQL PostgreSQL e handlers de rotas com tabelas TEMP dentro de uma transação encerrada com ROLLBACK. Cobre migration repetível, registros anteriores, vários RDOs, exclusão de não aprovados, reversão/reaprovação, correção/exclusão, isolamento, cadastro, edição, remoção, auditoria e cópia. Autenticação, verificação de schema e gravação da auditoria são substituídas no teste; os dados de projetos reais não são usados.
- Backend: `npm.cmd run test:eap-progress` e `npm.cmd run test:rdo-workflow` — passaram; fluxo do RDO com 15 cenários.
- Frontend: `npm.cmd run test:eap` e `npm.cmd run test:cockpit` — passaram.
- Frontend: `npm.cmd run build` — passou.
- Repositório: `git diff --check` — passou.
- Navegador com API totalmente simulada: edição de preço em linha, payload exclusivamente monetário, validação de decimais, confirmação retroativa, cancelamento, falha de gravação mantendo rascunho, agrupador sem preço editável, saldo no painel e totais independentes dos filtros.
- Navegador em 1440×1000 e 390×844: consulta, painel, tema claro/escuro, valor zero, remoção de preço e cadastro pelo formulário. Capturas usam dados sintéticos.
- PostgreSQL local: `npm.cmd run migrate:dry-run` identificou somente a nova migration; `npm.cmd run migrate` a aplicou e `npm.cmd run migrate:status` confirmou zero pendências.

## Riscos e pendências

- O build mantém o aviso já existente de bundle JavaScript superior a 500 kB.
- O gráfico e o fechamento de boletins não fazem parte desta entrega. Os valores são recalculados com o preço atual; não representam um histórico de preços congelados.
- Não houve deploy, push ou publicação de PR. Outros ambientes precisam receber a migration antes da atualização do backend.

## Evidências visuais

- [EAP e resumo financeiro no desktop](medicao-desktop.png)
- [Preço e saldo no painel](medicao-painel.png)
- [Resumo no celular](medicao-mobile.png)
- [Editor no celular](medicao-mobile-editor.png)
- [Tema escuro no celular](medicao-mobile-escuro.png)
