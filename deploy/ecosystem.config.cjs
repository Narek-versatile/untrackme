// pm2 process definition. Started by deploy/setup.sh, restarted on boot
// through `pm2 startup` + `pm2 save`.

module.exports = {
  apps: [
    {
      name: 'untrackme',
      script: 'server.js',
      cwd: '/opt/untrackme',

      // better-sqlite3 is synchronous and the database is a single file,
      // so this runs as one process rather than a cluster.
      instances: 1,
      exec_mode: 'fork',

      autorestart: true,
      max_restarts: 10,
      min_uptime: '20s',
      max_memory_restart: '256M',

      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        PUBLIC_ORIGIN: 'https://untrackme.narek.actcollege.am',

        // TEMPORARY: the second host is the sslip.io stand-in used while the
        // real domain has no DNS. Short links point at whichever of these
        // hosts served the request. Drop the stand-in from this list once the
        // domain resolves. See TEMPORARY.md.
        ALLOWED_HOSTS: 'untrackme.narek.actcollege.am,109-94-170-160.sslip.io',

        // Kept outside the checkout so a redeploy never touches the data.
        UNTRACKME_DATA_DIR: '/var/lib/untrackme'
      },

      // Only errors are worth keeping; the app logs nothing per request.
      error_file: '/var/log/untrackme/error.log',
      out_file: '/var/log/untrackme/out.log',
      merge_logs: true,
      time: true
    }
  ]
};
