-- Crop Catalogue (MOA / Ethio-Seed)
-- Crop source: https://ethioseed.moa.gov.et/api/crops-catalog
-- Cropopen: http://196.191.93.34/moa-portal/cropopen/

DROP TABLE IF EXISTS "crop_variety" CASCADE;
DROP TABLE IF EXISTS "crop_catalog" CASCADE;
DROP TABLE IF EXISTS "ecological_zone" CASCADE;
DROP TABLE IF EXISTS "crop_category" CASCADE;

CREATE TABLE "crop_category" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

COMMENT ON TABLE "crop_category" IS 'Crop production categories referenced by crop_catalog.category_id';

CREATE TABLE "ecological_zone" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT
);

COMMENT ON TABLE "ecological_zone" IS 'Preferred agro-ecological zones referenced by crop_catalog.preferred_ecological_zone_id';

CREATE TABLE "crop_catalog" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    category_id INTEGER REFERENCES crop_category(id),
    known_for TEXT,
    num_field_inspection_needed INTEGER NOT NULL DEFAULT 0,
    isolation_distance INTEGER NOT NULL DEFAULT 0,
    preferred_ecological_zone_id INTEGER REFERENCES ecological_zone(id)
);

COMMENT ON TABLE "crop_catalog" IS 'MOA crop catalogue';
CREATE INDEX "crop_catalog_name_idx" ON "crop_catalog" (name);
CREATE INDEX "crop_catalog_category_id_idx" ON "crop_catalog" (category_id);
CREATE INDEX "crop_catalog_ecological_zone_id_idx" ON "crop_catalog" (preferred_ecological_zone_id);

CREATE TABLE "crop_variety" (
    id INTEGER PRIMARY KEY,
    crop_id INTEGER REFERENCES crop_catalog(id),
    crop_name TEXT NOT NULL,
    common_name TEXT NOT NULL,
    category TEXT,
    release_year INTEGER,
    release_date DATE,
    release_raw TEXT,
    maintainer TEXT,
    source TEXT,
    details_url TEXT
);

COMMENT ON TABLE "crop_variety" IS 'MOA / Ethio-Seed released crop varieties, linked to crop_catalog via crop_id';
COMMENT ON COLUMN "crop_variety".crop_name IS 'Crop/seed label as shown on the Ethio-Seed variety list';
COMMENT ON COLUMN "crop_variety".release_raw IS 'Original release date text from the source (some values are malformed at source)';
CREATE INDEX "crop_variety_crop_id_idx" ON "crop_variety" (crop_id);
CREATE INDEX "crop_variety_common_name_idx" ON "crop_variety" (common_name);
CREATE INDEX "crop_variety_release_year_idx" ON "crop_variety" (release_year);
CREATE INDEX "crop_variety_source_idx" ON "crop_variety" (source);
