#!/bin/sh
# Creates the least-privilege role the API connects as: it can create and own
# the application's tables but is not a superuser, so it cannot read server
# files or run programs (COPY ... TO PROGRAM).
#
# Runs automatically when the data directory is first initialized. For a
# database created by an earlier version, run it once (idempotent):
#   docker compose exec postgres_db sh /docker-entrypoint-initdb.d/10-app-role.sh
set -e
: "${POSTGRES_APP_USER:?POSTGRES_APP_USER must be set}"
: "${POSTGRES_APP_PASSWORD:?POSTGRES_APP_PASSWORD must be set}"

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
	-v app_user="$POSTGRES_APP_USER" \
	-v app_password="$POSTGRES_APP_PASSWORD" \
	-v db_name="$POSTGRES_DB" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'app_user')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'app_user') \gexec
ALTER ROLE :"app_user" WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD :'app_password';
GRANT CONNECT ON DATABASE :"db_name" TO :"app_user";
GRANT USAGE, CREATE ON SCHEMA public TO :"app_user";
-- Tables created by earlier versions belong to the superuser; hand them over.
SELECT format('ALTER TABLE public.%I OWNER TO %I', tablename, :'app_user')
FROM pg_tables
WHERE schemaname = 'public' AND tableowner <> :'app_user' \gexec
SQL
