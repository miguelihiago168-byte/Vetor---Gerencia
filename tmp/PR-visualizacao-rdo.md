## Resumo

Reorganiza a tela de detalhes do Relatório Diário de Obra para que a equipe identifique a obra, confira a situação da aprovação e encontre os registros do dia.

## O que foi feito

- O cabeçalho reúne número do RDO, status, obra e empresas. Data, responsável, local e aprovações ficam em uma faixa de leitura.
- O resumo do dia leva às seções de mão de obra, atividades e ocorrências. Cada indicador tem um ícone e a presença de ocorrências ganha destaque.
- O download do PDF fica visível na barra superior. O menu de ações respeita o perfil e o status do relatório.

## Validação

- Build de produção do frontend e `git diff --check` concluídos.
- Verificação no Chrome com dados simulados em desktop e nas larguras de 320 e 390 px. Foram conferidos os indicadores, os destinos dos atalhos, os temas e a abertura e fechamento do menu de ações.

## Riscos e pendências

A verificação visual utilizou dados simulados. A geração de PDF e a gravação das decisões de aprovação no servidor ficaram fora do teste.

## Evidências visuais

[Desktop](rdo-desktop.png) · [Celular](rdo-celular.png) · [Tema escuro](rdo-escuro.png)
