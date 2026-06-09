module.exports = {
  apps: [{
    name: 'WhatsappMod',
    script: 'npm',
    args: 'run start',
    watch: true,
    ignore_watch: ['node_modules', 'auth', 'data', '.git', 'logs'],
    autorestart: true,
  }]
}
