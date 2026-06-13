const fs = require('fs');
const path = require('path');

const backendDir = path.join(__dirname, '..');
const databaseDir = process.env.DB_DIR || path.join(backendDir, 'database');
const uploadsDir = process.env.UPLOADS_DIR || path.join(backendDir, 'uploads');
const backupsRoot = process.env.BACKUP_DIR || path.join(backendDir, 'backups');

const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const targetDir = path.join(backupsRoot, `backup-${timestamp}`);

const copyIfExists = (source, target) => {
  if (!fs.existsSync(source)) return false;
  fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: true });
  return true;
};

fs.mkdirSync(targetDir, { recursive: true });

const databaseCopied = copyIfExists(databaseDir, path.join(targetDir, 'database'));
const uploadsCopied = copyIfExists(uploadsDir, path.join(targetDir, 'uploads'));

fs.writeFileSync(
  path.join(targetDir, 'manifest.json'),
  JSON.stringify({
    created_at: new Date().toISOString(),
    database_included: databaseCopied,
    uploads_included: uploadsCopied
  }, null, 2)
);

console.log(`[backup] criado em ${targetDir}`);
console.log(`[backup] database=${databaseCopied ? 'incluido' : 'ausente'} uploads=${uploadsCopied ? 'incluidos' : 'ausentes'}`);
