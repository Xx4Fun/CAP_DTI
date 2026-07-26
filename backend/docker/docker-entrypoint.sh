#!/bin/sh
set -e

# Permissions setup
chmod -R 777 /var/www/html/storage /var/www/html/bootstrap/cache || true

# Cache configuration & routes
php artisan config:cache || true
php artisan route:cache || true
php artisan storage:link || true
php artisan migrate --force || true

# Execute Supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf


