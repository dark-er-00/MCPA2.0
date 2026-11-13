FROM php:8.4-apache-bookworm

# The official image builds in cURL, mbstring, JSON, fileinfo, sessions and
# OpenSSL. Assert those dependencies so a base-image change fails the build.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && php -r 'foreach (["curl", "mbstring", "json", "fileinfo", "session", "openssl", "Zend OPcache"] as $ext) { if (!extension_loaded($ext)) { fwrite(STDERR, "Missing PHP extension: $ext\n"); exit(1); } }' \
    && a2enmod rewrite headers \
    && cp "$PHP_INI_DIR/php.ini-production" "$PHP_INI_DIR/php.ini" \
    && install -d -m 1733 /var/lib/php/sessions \
    && chmod 755 /var/www/html

WORKDIR /var/www/html

COPY docker/apache.conf /etc/apache2/sites-available/000-default.conf
COPY docker/php.ini /usr/local/etc/php/conf.d/zz-mcpa.ini
COPY docker/start.sh /usr/local/bin/mcpa-start
COPY docker/healthcheck.php /usr/local/bin/mcpa-healthcheck.php
COPY server/ ./server/
COPY public/ ./public/

RUN chmod 755 /usr/local/bin/mcpa-start

# PORT is resolved again at startup; Render can supply any valid HTTP port.
ENV PORT=10000
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD ["php", "/usr/local/bin/mcpa-healthcheck.php"]
CMD ["/usr/local/bin/mcpa-start"]
