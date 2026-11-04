#!/bin/sh
set -e

# Permissions setup
chmod -R 777 /var/www/html/storage /var/www/html/bootstrap/cache || true

# Cache config, routes, events and views. No `|| true`: a failed cache must fail the boot, not
# silently leave every request re-reading config and route files.
php artisan optimize
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

if [ "${RUN_CAPSTONE_TWO_MONTH_MONITORING_SEED:-2026-11-01-8w-v2}" = "2026-11-01-8w-v2" ]; then
    php artisan db:seed --class=CapstoneTwoMonthMonitoringSeeder --force
fi

# Execute Supervisord
exec /usr/bin/supervisord -c /etc/supervisor/conf.d/supervisord.conf
