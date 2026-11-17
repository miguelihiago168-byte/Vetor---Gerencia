## Resumo

A tela de Projetos e o cabeçalho do dashboard da obra reutilizam o desenho de construção da capa do RDO.

## O que foi feito

- Aplicado o desenho translúcido à direita das duas faixas azuis, com intensidade menor no dashboard para facilitar a leitura dos indicadores.
- Reorganizados os cartões com contratante e executante lado a lado e percentual junto à barra de avanço físico. O cartão pode ser aberto pelo teclado.
- Incluídas a contagem de obras da lista atual e uma mensagem para filtros sem resultados.

## Validação

- O build de produção do frontend e os testes do cockpit passaram.
- Validação no Chrome com dados de exemplo em desktop claro e celular escuro. Foram conferidos a troca de lista, a abertura do formulário, o acesso ao dashboard pelo teclado e a largura das duas páginas.
- O Git verificou a formatação do diff.

## Riscos e pendências

O Vite emitiu um aviso de tamanho do pacote JavaScript durante o build.

## Evidências visuais

[Projetos em desktop](projetos-desktop.png) · [Projetos em celular](projetos-mobile.png) · [Dashboard em desktop](dashboard-construcao-desktop.png) · [Dashboard em celular](dashboard-construcao-mobile.png)
