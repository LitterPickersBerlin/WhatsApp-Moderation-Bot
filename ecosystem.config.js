module.exports = {
  apps: [{
    name: 'WhatsappMod',
    script: 'npm',
    args: 'run start',
    cwd: __dirname,
    watch: true,
    ignore_watch: ['node_modules', 'auth', 'data', '.git', 'logs', 'dist'],
    autorestart: true,
  }]
}
