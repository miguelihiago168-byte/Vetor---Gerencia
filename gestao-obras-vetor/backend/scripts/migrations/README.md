# Migrations versionadas

Este diretorio recebe migrations novas e deterministicas do backend.

Regras:

- Criar arquivos com prefixo numerico crescente, por exemplo `000001_nome_da_migration.js`.
- Cada arquivo deve exportar `id`, `description` e `up`.
- `up` recebe um contexto com `run`, `get`, `all` e `target`.
- Nao executar migrations automaticamente no startup de producao.
- Em producao, execucao real exige `MIGRATIONS_ALLOW_PRODUCTION=true`.
- Antes de executar em producao, rodar `npm run migrate:status` e validar backup.

Exemplo:

```js
module.exports = {
  id: '000001_exemplo',
  description: 'Descreve a mudanca de schema',
  async up({ run }) {
    await run('ALTER TABLE exemplo ADD COLUMN novo_campo TEXT');
  }
};
```
