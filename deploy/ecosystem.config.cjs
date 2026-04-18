module.exports = {
  apps: [
    {
      name: 'reviews-widget',
      script: './dist/server.js',
      cwd: '/var/www/reviews-widget',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3010,
      },
      max_memory_restart: '300M',
      error_file: '/var/log/pm2/reviews-widget-error.log',
      out_file: '/var/log/pm2/reviews-widget-out.log',
      merge_logs: true,
      time: true,
      kill_timeout: 5000,
    },
  ],
};
