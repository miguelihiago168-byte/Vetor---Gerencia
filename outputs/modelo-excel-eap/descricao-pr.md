## Resumo

O modelo de Excel da EAP passa a aceitar o mesmo valor total de medição informado no formulário de atividades.

## O que foi feito

- A coluna K recebe o valor opcional em reais e inclui uma orientação de preenchimento.
- A prévia mostra o valor lido e aponta a linha com preço inválido ou informado em um agrupador.
- A confirmação grava o valor junto com a atividade. A substituição da EAP e de suas dependências ocorre em uma única transação.
- Planilhas do modelo anterior continuam aceitas. Células vazias mantêm a atividade sem preço e zero é um valor válido.

## Validação

- O teste de integração baixou o modelo, validou a planilha e conferiu os valores gravados em tabelas temporárias do PostgreSQL. Também verificou o modelo antigo em formato XLS e entradas inválidas.
- Os testes de medição do backend e do formulário da EAP passaram. O build de produção do frontend foi concluído.

## Riscos e pendências

A disponibilização no sistema em produção depende da publicação da branch.

## Evidências visuais

O modelo gerado pelo sistema está disponível junto desta descrição para conferência da coluna K.
