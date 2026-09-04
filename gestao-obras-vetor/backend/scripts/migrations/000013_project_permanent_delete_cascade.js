module.exports = {
  id: '000013_project_permanent_delete_cascade',
  description: 'Permite exclusao definitiva de projeto com cascade nas relacoes por tenant',
  async up({ run }) {
    const foreignKeys = [
      ['atividades_eap', 'fk_eap_projeto_tenant'],
      ['rdos', 'fk_rdos_projeto_tenant'],
      ['rnc', 'fk_rnc_projeto_tenant']
    ];

    for (const [table, constraint] of foreignKeys) {
      await run(`ALTER TABLE ${table} DROP CONSTRAINT IF EXISTS ${constraint}`);
      await run(`
        ALTER TABLE ${table}
        ADD CONSTRAINT ${constraint}
        FOREIGN KEY (tenant_id, projeto_id)
        REFERENCES projetos(tenant_id, id)
        ON DELETE CASCADE
      `);
    }
  }
};
