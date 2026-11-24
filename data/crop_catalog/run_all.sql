-- Load Crop Catalogue tables (requires psql)
-- Usage: psql -d your_database -f run_all.sql

\i 01_create_crop_catalog.sql
\i 02_insert_crop_category.sql
\i 03_insert_ecological_zone.sql
\i 04_insert_crop_catalog.sql
\i 05_insert_crop_variety.sql
