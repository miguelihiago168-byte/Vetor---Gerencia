const { db } = require('../config/database');

const migrateAddEmailSystem = async () => {
  console.log('Migrando: criando tabelas de email...');
  try {
    // Tabela de configuração SMTP
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS email_config (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER,
          provider TEXT NOT NULL,
          smtp_host TEXT NOT NULL,
          smtp_port INTEGER NOT NULL,
          smtp_user TEXT NOT NULL,
          smtp_pass_encrypted TEXT NOT NULL,
          from_name TEXT NOT NULL,
          from_email TEXT NOT NULL,
          is_active INTEGER DEFAULT 1,
          created_by_user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id),
          UNIQUE(tenant_id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Tabela de templates de email
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS email_templates (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER,
          name TEXT NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT NOT NULL,
          description TEXT,
          created_by_user_id INTEGER,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          FOREIGN KEY (created_by_user_id) REFERENCES usuarios(id),
          UNIQUE(tenant_id, name)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Tabela de histórico de emails
    await new Promise((resolve, reject) => {
      db.run(`
        CREATE TABLE IF NOT EXISTS email_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          tenant_id INTEGER,
          sender_user_id INTEGER NOT NULL,
          recipient_email TEXT NOT NULL,
          subject TEXT NOT NULL,
          body_html TEXT,
          template_used TEXT,
          status TEXT NOT NULL,
          error_message TEXT,
          sent_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (tenant_id) REFERENCES tenants(id),
          FOREIGN KEY (sender_user_id) REFERENCES usuarios(id)
        )
      `, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    // Índices para performance
    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_email_config_tenant ON email_config(tenant_id)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_email_templates_tenant ON email_templates(tenant_id)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_email_history_tenant_user ON email_history(tenant_id, sender_user_id)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    await new Promise((resolve, reject) => {
      db.run(`CREATE INDEX IF NOT EXISTS idx_email_history_status ON email_history(status, created_at)`, (err) => {
        if (err) reject(err);
        else resolve();
      });
    });

    console.log('✓ Tabelas de email criadas com sucesso');
  } catch (error) {
    console.error('Erro na migração de email:', error);
  } finally {
    db.close();
  }
};

if (require.main === module) {
  migrateAddEmailSystem();
}

module.exports = migrateAddEmailSystem;
