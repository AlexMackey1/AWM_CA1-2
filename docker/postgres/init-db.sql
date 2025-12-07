-- Enable PostGIS extensions
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS fuzzystrmatch;
CREATE EXTENSION IF NOT EXISTS postgis_tiger_geocoder;

-- Create database user (if not already created)
DO
$do$
BEGIN
   IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'webmappingca') THEN
      CREATE ROLE webmappingca LOGIN PASSWORD 'awm123';
   END IF;
END
$do$;

-- Grant privileges
GRANT ALL PRIVILEGES ON DATABASE webmapping_db_ca TO webmappingca;
GRANT ALL ON SCHEMA public TO webmappingca;
GRANT ALL ON ALL TABLES IN SCHEMA public TO webmappingca;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO webmappingca;

-- Set default privileges for future objects
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO webmappingca;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO webmappingca;

-- Create spatial reference system functions
SELECT PostGIS_Full_Version();