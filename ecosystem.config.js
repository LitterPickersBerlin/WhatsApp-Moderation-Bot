module.exports = {
  apps: [{
    name: 'whatsapp-bot',
    script: 'dist/index.js',
    env_file: '.env',
    watch: false,
    autorestart: true,
    pre_start: 'npm run build'
  }]
}
