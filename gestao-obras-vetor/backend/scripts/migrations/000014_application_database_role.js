/* Creates the least-privilege runtime role.  This migration is intentionally
 * executed by the administrative connection, never by the HTTP application. */
module.exports = {
  id: '000014_application_database_role',
  description: 'Cria role de aplicacao sem BYPASSRLS e concede somente acesso aos objetos app',
  async up({ run }) {
    const role = process.env.DB_APP_USER || 'gestao_app';
    // A separate password must be configured in production. The fallback is
    // only to make a fresh local Docker setup usable without extra secrets.
    const password = process.env.DB_APP_PASSWORD || process.env.DB_PASSWORD;
    if (!password) throw new Error('DB_APP_PASSWORD (ou DB_PASSWORD em desenvolvimento) deve ser definido.');

    await run(`SELECT set_config('app.provision_role_name', ?, true)`, [role]);
    await run(`SELECT set_config('app.provision_role_password', ?, true)`, [password]);
    await run(`
      DO $$
      DECLARE
        app_role NAME := current_setting('app.provision_role_name');
        app_password TEXT := current_setting('app.provision_role_password');
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = app_role) THEN
          EXECUTE format('CREATE ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', app_role, app_password);
        ELSE
          EXECUTE format('ALTER ROLE %I LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT PASSWORD %L', app_role, app_password);
        END IF;
        EXECUTE format('GRANT USAGE ON SCHEMA public TO %I', app_role);
        EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO %I', app_role);
        EXECUTE format('GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO %I', app_role);
        EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO %I', app_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO %I', app_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO %I', app_role);
        EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO %I', app_role);
      END $$
    `);
  }
};
