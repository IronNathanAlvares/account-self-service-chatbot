-- Grant the server-side service_role full DML on the app tables. Depending on
-- how migrations are applied locally, tables can be created without the default
-- Supabase DML grants (only Dxtm), which causes "permission denied" from the
-- /api/chat server client. These explicit grants keep local and hosted in sync.

grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;
grant execute on all functions in schema public to service_role;

alter default privileges in schema public
  grant select, insert, update, delete on tables to service_role;
alter default privileges in schema public
  grant execute on functions to service_role;
