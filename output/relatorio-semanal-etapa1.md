# Relatório Semanal com avanço físico por atividade

## Resumo

O responsável pode revisar as execuções sugeridas pelos RDOs aprovados, acrescentar atividades da EAP e definir o que segue para a próxima semana. O PDF apresenta os percentuais no período e dedica o resumo físico apenas às seleções feitas. A entrega utiliza a branch `codex/feat/avanco-relatorio-semanal`.

## O que foi feito

- A tela de seleção e consulta foi ajustada em `frontend/src/pages/RelatorioSemanal.jsx` e `RelatorioSemanal.css`. A programação mantém a previsão de conclusão das atividades em continuidade. O catálogo consultável distingue a situação capturada na preparação do avanço comprovado no corte.
- A rota `backend/routes/relatorio_semanal.js` e o serviço `backend/services/relatorioSemanalService.js` recuperam os valores e gravam as evidências no JSON do relatório. Os filtros usam obra e tenant. O navegador envia escolhas do usuário. Se as fontes de atividades mudarem entre a revisão e a gravação de um relatório novo ou atualizado, a API solicita nova revisão.
- A execução segue a data do serviço no RDO aprovado. O acumulado segue a data da alteração oficial na EAP, no fuso da aplicação. O serviço consulta eventos aplicados, registros legados e auditoria. Para uma atividade folha, o valor gravado na EAP também pode comprovar um corte quando sua atualização está datada até aquele corte. Abertura e encerramento são avaliados separadamente. A evolução é a diferença em pontos percentuais e conserva o sinal.
- A atividade pai usa a evidência do próprio agrupamento. Cada identificador aparece uma vez no resumo. Atividades avulsas mantêm a identificação no RDO e a situação de execução. Ausência ou conflito de evidências resulta em indisponibilidade.
- O gerador `backend/services/relatorioSemanalPdf.js` monta execução, programação e resumo a partir das escolhas. A reemissão dos relatórios antigos usa o novo layout e os dados de atividades já gravados. A atualização de fontes é explícita e depende de salvamento. A persistência utiliza a coluna JSONB existente e dispensa migração.

## Validação

- Passaram os testes de serviço semanal, histórico em PostgreSQL local, rotas HTTP, PDF, Curva S, suprimentos e arquivos do relatório. Também passaram as suítes de progresso da EAP, fluxo de RDO e arquitetura de isolamento. O teste de banco usou tabelas temporárias e encerrou a transação com rollback.
- Os testes cobriram avanço zero, parcial, conclusão, regressão aplicada, reversão pendente, aprovação após a semana do serviço, virada de dia no fuso da aplicação, histórico incompleto, edição e reemissão. O relatório salvo em 40% conservou esse valor depois do registro de 75% na semana seguinte.
- O teste de interface em Chrome headless usou uma obra demonstrativa e API de teste. Exercitou a inclusão manual de um pai, a desmarcação da filha, a seleção independente na programação, o salvamento e a abertura da prévia.
- A comparação entre catálogos de 200 e cinco atividades produziu três páginas nos dois casos. A extração do texto confirmou uma ocorrência por atividade no resumo e a ausência dos outros 195 itens. As três páginas foram renderizadas e conferidas. Também foi gerado um PDF com descrições extensas e continuação das tabelas.
- O build de produção do frontend e a verificação de espaços do Git passaram. O Vite emitiu aviso sobre o tamanho do pacote principal.

## Riscos e pendências

A cobertura histórica depende da qualidade dos registros de cada obra. Relatórios antigos podem mostrar atividades com a identificação original e avanço indisponível. A homologação com dados reais permanece pendente. Conferir uma obra com aprovação tardia e um relatório anterior à melhoria, incluindo a reemissão com um perfil de acesso restrito.

## Evidências visuais

O PDF de homologação contém cinco atividades, uma regressão de 5 p.p., uma atividade com histórico indisponível e as seções de suprimentos, equipe, clima e fotografia. [Abrir amostra](pdf/Relatorio-semanal-amostra.pdf)
