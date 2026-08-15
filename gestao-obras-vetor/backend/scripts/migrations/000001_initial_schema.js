/*
 * Baseline for new installations.
 *
 * This is deliberately the only versioned migration. The modules in
 * ../migration-history contain the former incremental steps and are executed
 * here only to build the exact current schema in one transaction/version.
 */
const historicalMigrationIds = [
  '000001_users_runtime_schema',
  '000002_runtime_route_schema',
  '000003_rdo_occurrence_records',
  '000003_rnc_correction_timestamp',
  '000004_material_traceability',
  '000004_requisicoes_runtime_schema',
  '000005_eap_activity_events',
  '000005_material_outbound_flow',
  '000006_received_email_flags',
  '000007_mensagem_reunioes',
  '000008_repair_orphan_notifications',
  '000009_user_signature',
  '000010_rnc_approval_signature',
  '000011_material_supplier_name',
  '000012_service_accounts',
  '000012_repair_tenant_trial_columns',
  '000013_postgres_rls_groups',
  '000014_application_database_role',
];

const historicalMigrations = historicalMigrationIds
  .map((id) => require(`../migration-history/${id}`));

// The trial-column repair was published after those columns were already part
// of the schema. Databases with the original history are therefore complete
// even when they do not have that repair recorded.
const supersededMigrationIds = historicalMigrationIds
  .filter((id) => id !== '000012_repair_tenant_trial_columns');

module.exports = {
  id: '000001_initial_schema',
  description: 'Cria o schema completo atual para uma nova instalacao',
  // Instalacoes com todo o historico anterior ja possuem este schema.
  supersedes: supersededMigrationIds,
  async up(context) {
    for (const migration of historicalMigrations) {
      await migration.up(context);
    }
  },
};
