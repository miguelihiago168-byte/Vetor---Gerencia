/**
 * Unified First-Time Database Setup Script
 * Run with: node scripts/setupDatabase.js
 * Optional: node scripts/setupDatabase.js --with-dummy-data
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const scriptsDir = __dirname;
const args = process.argv.slice(2);
const withDummyData = args.includes('--with-dummy-data');

// -------------------------------------------------------
// Migration scripts in correct order
// -------------------------------------------------------
const migrationScripts = [
  'migrate_rdo_and_projects.js',
  'migrate_add_eap_fields.js',
  'migrate_add_eap_metrics.js',
  'migrate_add_rdo_fields.js',
  'migrate_add_curva_s_fields.js',
  'migrate_add_rdo_extended.js',
  'migrate_add_rdo_mao_obra_detalhada.js',
  'migrate_add_rdo_quantidade.js',
  'migrate_add_rdo_number_and_history.js',
  'migrate_add_rdo_versions.js',
  'migrate_add_rnc_descricao_correcao.js',
  'migrate_add_rnc_extra_fields.js',
  'migrate_add_rnc_fotos_field.js',
  'migrate_add_purchases.js',
  'migrate_update_cotacoes_fields.js',
  'migrate_add_pedido_aplicacao_local.js',
  'migrate_add_almoxarifado.js',
  'migrate_add_anexos_rnc_id.js',
  'migrate_add_notifications.js',
  'migrate_add_notifications_unique_index.js',
  'migrate_add_pin.js',
  'migrate_add_indexes.js',
  'migrate_integrity_constraints.js',
  'migrate_soft_delete_users.js',
];

// -------------------------------------------------------
// Helpers
// -------------------------------------------------------
function runScript(scriptFile, label) {
  const scriptPath = path.join(scriptsDir, scriptFile);
  if (!fs.existsSync(scriptPath)) {
    console.warn(`  ⚠ Skipping (not found): ${scriptFile}`);
    return;
  }
  try {
    execSync(`node "${scriptPath}"`, { stdio: 'inherit' });
    if (label) console.log(`  ✓ ${label}`);
  } catch (err) {
    console.error(`  ✗ Failed: ${label || scriptFile}`);
    throw err;
  }
}

// -------------------------------------------------------
// Main
// -------------------------------------------------------
async function main() {
  console.log('═══════════════════════════════════════════════════');
  console.log('  Gestão de Obras Vetor — Database Setup');
  console.log('═══════════════════════════════════════════════════\n');

  // Step 1 — Initialize base tables + default admin user
  console.log('📦 Step 1: Initializing base tables and default admin...');
  runScript('initDatabase.js', 'Base tables + admin user created');

  // Step 2 — Run all migrations
  console.log('\n🔄 Step 2: Running migrations...');
  for (const script of migrationScripts) {
    runScript(script, script.replace('.js', ''));
  }

  // Step 3 — Optional dummy data
  if (withDummyData) {
    console.log('\n🎲 Step 3: Seeding dummy data...');
    const dummyScript = path.join(scriptsDir, 'seedDummyData.js');
    if (fs.existsSync(dummyScript)) {
      runScript('seedDummyData.js', 'Dummy data seeded');
    } else {
      console.warn('  ⚠ seedDummyData.js not found — skipping dummy data.');
    }
  } else {
    console.log('\nℹ️  Step 3: Skipping dummy data (use --with-dummy-data to include it).');
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  ✅ Database setup complete!');
  console.log('\n  Default credentials:');
  console.log('    Login: 000001');
  console.log('    Password: 123456');
  console.log('═══════════════════════════════════════════════════\n');
}

main().catch((err) => {
  console.error('\n❌ Setup failed:', err.message || err);
  process.exit(1);
});
