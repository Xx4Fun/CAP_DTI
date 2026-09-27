#!/bin/sh
set -e

# Permissions setup
chmod -R 777 /var/www/html/storage /var/www/html/bootstrap/cache || true

# Cache configuration & routes
php artisan config:cache || true
php artisan route:cache || true
php artisan storage:link || true
# Run database migrations
php artisan migrate --force

if [ "${RUN_CAPSTONE_COMMODITY_KEY_BACKFILL:-}" = "2026-09-01-v1" ]; then
    php artisan db:seed --class=CapstoneCommodityKeyBackfillSeeder --force
fi

if [ "${RUN_CAPSTONE_MONITORING_REPLACEMENT:-}" = "2026-09-01-v1" ]; then
    php artisan db:seed --class=CapstoneMonitoringReplacementSeeder --force
fi

if [ "${RUN_CAPSTONE_MONITORING_SEED:-}" = "2026-09-01-v1" ]; then
    php artisan db:seed --class=CapstoneMonitoringSeeder --force
fi

# Execute Supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
