#!/bin/sh
set -e

# Cache configuration & routes
php artisan config:cache || true
php artisan route:cache || true
php artisan storage:link || true
php artisan migrate --force || true

# Execute Supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf

