const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const dbPath = path.join(__dirname, '..', 'database', 'gestao_obras.db');

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('DB open error:', err.message);
    process.exit(1);
  }

  db.all("SELECT name, type FROM sqlite_master WHERE type IN ('table','index') ORDER BY name;", (err, rows) => {
    if (err) {
      console.error('Schema read error:', err.message);
      db.close();
      process.exit(1);
    }

    console.log('--- tables/indexes ---');
    rows.forEach(r => console.log(`${r.type.toUpperCase()}: ${r.name}`));

    db.get('PRAGMA integrity_check;', (err2, row2) => {
      if (err2) {
        console.error('Integrity check error:', err2.message);
      } else if (row2) {
        console.log('PRAGMA integrity_check =>', row2.integrity_check);
      }
      db.close();
    });
  });
});
