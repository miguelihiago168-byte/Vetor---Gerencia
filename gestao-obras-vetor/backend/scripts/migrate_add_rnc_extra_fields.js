const { db } = require('../config/database');

/**
 * Migration: add extra fields to RNC
 * - data_prevista_encerramento (DATE)
 * - origem (TEXT)
 * - area_afetada (TEXT)
 * - norma_referencia (TEXT)
 */
async function migrate() {
  console.log('Migrating: add extra fields to RNC...');

  try {
    await new Promise((resolve, reject) => {
      db.get("PRAGMA table_info('rnc')", [], (err, row) => {
        if (err) reject(err); else resolve(row);
      });
    });

    const existing = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info('rnc')", [], (err, rows) => {
        if (err) reject(err); else resolve(rows);
      });
    });

    const hasColumn = (name) => existing.some((c) => c.name === name);

    const exec = (sql) => new Promise((resolve, reject) => db.run(sql, (err) => err ? reject(err) : resolve()));

    if (!hasColumn('data_prevista_encerramento')) {
      await exec("ALTER TABLE rnc ADD COLUMN data_prevista_encerramento DATE");
      console.log('✓ Added column: data_prevista_encerramento');
    }
    if (!hasColumn('origem')) {
      await exec("ALTER TABLE rnc ADD COLUMN origem TEXT");
      console.log('✓ Added column: origem');
    }
    if (!hasColumn('area_afetada')) {
      await exec("ALTER TABLE rnc ADD COLUMN area_afetada TEXT");
      console.log('✓ Added column: area_afetada');
    }
    if (!hasColumn('norma_referencia')) {
      await exec("ALTER TABLE rnc ADD COLUMN norma_referencia TEXT");
      console.log('✓ Added column: norma_referencia');
    }

    console.log('✅ Migration complete.');
  } catch (error) {
    console.error('❌ Migration failed:', error);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  migrate();
}

module.exports = migrate;
