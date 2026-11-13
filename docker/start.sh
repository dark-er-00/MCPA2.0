#!/bin/sh
set -eu

PORT="${PORT:-10000}"
case "$PORT" in
    ''|*[!0-9]*) echo 'PORT must be an integer from 1 to 65535.' >&2; exit 1 ;;
esac
if [ "${#PORT}" -gt 5 ] || [ "$PORT" -lt 1 ] || [ "$PORT" -gt 65535 ]; then
    echo 'PORT must be an integer from 1 to 65535.' >&2
    exit 1
fi
export PORT
printf 'Listen 0.0.0.0:%s\n' "$PORT" > /etc/apache2/ports.conf

# This preflight validates local configuration only: no network, migrations,
# data changes or generated browser configuration writes.
php /var/www/html/server/console.php preflight

if [ "${RENDER:-}" = 'true' ]; then
    apache2ctl -t -D MCPA_RENDER_HTTPS
    exec apache2-foreground -D MCPA_RENDER_HTTPS
fi

apache2ctl -t
exec apache2-foreground
