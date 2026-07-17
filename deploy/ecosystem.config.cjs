// ecosystem.config.cjs — configuración de PM2 para el backend NestJS.
//
// Este archivo vive en el SERVIDOR, en /var/www/phoenix-backend/ (se coloca UNA vez
// durante la Fase 5). NO va dentro del artefacto .zip del deploy (que solo lleva
// dist/, package.json y package-lock.json), por eso persiste entre despliegues.
//
// Uso:
//   pm2 start ecosystem.config.cjs   # primer arranque
//   pm2 reload phoenix-api           # recargas posteriores (lo hace el pipeline)
//   pm2 save && pm2 startup          # para que reviva tras reiniciar el EC2

module.exports = {
  apps: [
    {
      name: 'phoenix-api',
      cwd: '/var/www/phoenix-backend',
      script: 'dist/main.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '300M',
      // Las variables sensibles viven en /var/www/phoenix-backend/.env
      // (lo regenera el pipeline). NestJS con @nestjs/config las lee de ahí.
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
