// pm2 process definition. Run from this directory:
//   npm run build           # build server + web
//   pm2 start ecosystem.config.cjs
// Reload after a fresh build:
//   pm2 reload ccmux
//
// Logs default to ~/.pm2/logs/ccmux-out.log and ~/.pm2/logs/ccmux-error.log.
// Inherits env (CCMUX_*, RESEND_API_KEY, etc.) from the spawning shell.
module.exports = {
  apps: [
    {
      name: "ccmux",
      script: "server/dist/index.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      // Crash protection: count starts that die <5 s as failures, give up after
      // 10 consecutive failures so we don't hot-spin a boot loop.
      min_uptime: "5s",
      max_restarts: 10,
      restart_delay: 1000,
      exp_backoff_restart_delay: 200,
      kill_timeout: 5000,
      merge_logs: true,
      time: true,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
