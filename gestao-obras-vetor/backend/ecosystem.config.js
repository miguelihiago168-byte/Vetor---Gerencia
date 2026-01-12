module.exports = {
  apps: [
    {
      name: "gestao-obras-vetor-backend",
      script: "server.js",
      cwd: __dirname,
      exec_mode: "fork",
      instances: 1,
      autorestart: true,
      watch: false,
      max_restarts: 20,
      restart_delay: 5000,
      env: {
        NODE_ENV: "production",
        PORT: 3001
      },
      env_development: {
        NODE_ENV: "development",
        PORT: 3001
      }
    }
  ]
};
