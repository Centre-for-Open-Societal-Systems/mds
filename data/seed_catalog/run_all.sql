-- Load Ethio-Seed seed catalog and demand trend tables (requires psql)
-- Usage: psql -d your_database -f run_all.sql

\i 01_create_seed_catalog.sql
\i 02_insert_seed_catalog.sql
\i 03_insert_seed_demand_summary.sql
\i 04_insert_seed_demand_trend.sql
\i 05_insert_seed_demand_trend_by_crop.sql
