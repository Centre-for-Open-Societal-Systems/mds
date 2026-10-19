-- Load LIS livestock catalog tables (requires psql)
-- Usage: psql -d your_database -f run_all.sql

\i 01_create_livestock_catalog.sql
\i 02_insert_livestock_catalog.sql
\i 03_insert_livestock_population.sql
\i 04_insert_livestock_breed.sql
\i 05_insert_livestock_reference.sql
\i 06_insert_livestock_registry.sql
