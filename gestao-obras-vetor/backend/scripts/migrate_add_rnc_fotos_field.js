const { db } = require('../config/database');

async function migrate() {
  console.log('Migrating: add registros_fotograficos to RNC...');
  try {
    const cols = await new Promise((resolve, reject) => {
      db.all("PRAGMA table_info('rnc')", (err, rows) => err ? reject(err) : resolve(rows));
    });
    const has = cols.some(c => c.name === 'registros_fotograficos');
    if (!has) {
      await new Promise((resolve, reject) => db.run("ALTER TABLE rnc ADD COLUMN registros_fotograficos TEXT", (err) => err ? reject(err) : resolve()));
      console.log('✓ Added column: registros_fotograficos');
    } else {
      console.log('✓ Column registros_fotograficos already exists');
    }
    console.log('✅ Migration complete.');
  } catch (e) {
    console.error('❌ Migration failed:', e);
  } finally {
    db.close();
  }
}

if (require.main === module) migrate();

module.exports = migrate;
