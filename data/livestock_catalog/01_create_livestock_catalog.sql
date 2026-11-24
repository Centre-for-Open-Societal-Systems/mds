-- Ethiopia livestock catalog: species, population, breed reference data and ET-LITS registry
-- LIS population dashboard: https://lis.moa.gov.et/en/population
-- LIS API: https://lis.moa.gov.et/api/superset-proxy
-- ET-LITS registry: https://etlits.moa.gov.et
-- Reference standard: National Livestock Data Standard for Ethiopia (MOA / Development Gateway, March 2024)

DROP VIEW IF EXISTS "livestock_registry_validation" CASCADE;
DROP TABLE IF EXISTS "livestock_registry_entry" CASCADE;
DROP TABLE IF EXISTS "livestock_production_type_species" CASCADE;
DROP TABLE IF EXISTS "livestock_production_type" CASCADE;
DROP TABLE IF EXISTS "livestock_body_condition" CASCADE;
DROP TABLE IF EXISTS "livestock_location_type" CASCADE;
DROP TABLE IF EXISTS "livestock_gender" CASCADE;
DROP TABLE IF EXISTS "livestock_record_status" CASCADE;
DROP TABLE IF EXISTS "livestock_breed" CASCADE;
DROP TABLE IF EXISTS "livestock_population" CASCADE;
DROP TABLE IF EXISTS "livestock_catalog" CASCADE;

CREATE TABLE "livestock_catalog" (
    species_code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    icon_url TEXT,
    dataset_id INTEGER,
    scientific_name TEXT,
    subfamily TEXT,
    species_type_code INTEGER,
    chart_color TEXT,
    ear_tag_range TEXT,
    in_lis_population BOOLEAN NOT NULL DEFAULT FALSE,
    in_etlits_registry BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE "livestock_catalog" IS 'Livestock species catalog: LIS population dashboard species plus species registered in ET-LITS';
COMMENT ON COLUMN "livestock_catalog".species_code IS 'Species label as used by both the LIS dashboard and the ET-LITS livestock field';
COMMENT ON COLUMN "livestock_catalog".dataset_id IS 'LIS superset-proxy dataset id; NULL for species absent from the population dashboard';
COMMENT ON COLUMN "livestock_catalog".species_type_code IS 'First segment of the National Livestock Data Standard breed code (1 cattle, 2 goat, 3 sheep, 4 camel)';
COMMENT ON COLUMN "livestock_catalog".chart_color IS 'Series colour published by the LIS categories/species endpoint';
COMMENT ON COLUMN "livestock_catalog".ear_tag_range IS 'National ear tag number range reserved for the species';
CREATE INDEX "livestock_catalog_name_idx" ON "livestock_catalog" (name);

CREATE TABLE "livestock_population" (
    id SERIAL PRIMARY KEY,
    species_code TEXT NOT NULL REFERENCES livestock_catalog(species_code),
    census_year INTEGER NOT NULL,
    population_total BIGINT NOT NULL,
    source_record_count INTEGER NOT NULL DEFAULT 0
);

COMMENT ON TABLE "livestock_population" IS 'National livestock population totals by species and census year';
CREATE UNIQUE INDEX "livestock_population_species_year_uidx" ON "livestock_population" (species_code, census_year);
CREATE INDEX "livestock_population_year_idx" ON "livestock_population" (census_year);

CREATE TABLE "livestock_breed" (
    id INTEGER PRIMARY KEY,
    breed_code TEXT UNIQUE,
    name TEXT NOT NULL,
    abbreviation TEXT,
    species_code TEXT NOT NULL REFERENCES livestock_catalog(species_code),
    breed_type TEXT NOT NULL,
    in_national_standard BOOLEAN NOT NULL DEFAULT TRUE,
    in_etlits_registry BOOLEAN NOT NULL DEFAULT FALSE,
    source TEXT NOT NULL
);

COMMENT ON TABLE "livestock_breed" IS 'Breed reference data for catalogued species, keyed on the national [SpeciesTypeCode.BreedTypeCode.BreedNameCode] scheme';
COMMENT ON COLUMN "livestock_breed".breed_code IS 'et.breed scheme code; crossbreeds carry the composite exotic-x-indigenous form. NULL where the breed is used by ET-LITS but not coded in the national standard';
COMMENT ON COLUMN "livestock_breed".breed_type IS 'Indigenous, Exotic or Cross';
CREATE INDEX "livestock_breed_species_code_idx" ON "livestock_breed" (species_code);
CREATE INDEX "livestock_breed_name_idx" ON "livestock_breed" (name);
CREATE INDEX "livestock_breed_breed_type_idx" ON "livestock_breed" (breed_type);

CREATE TABLE "livestock_gender" (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    in_etlits_registry BOOLEAN NOT NULL DEFAULT FALSE
);

COMMENT ON TABLE "livestock_gender" IS 'Sex enumerators defined by the National Livestock Data Standard gender field';

CREATE TABLE "livestock_location_type" (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    ethiopian_zone_name TEXT,
    altitude_description TEXT,
    crop_catalog_ecological_zone_id INTEGER,
    description TEXT
);

COMMENT ON TABLE "livestock_location_type" IS 'ET-LITS locationType values mapped onto Ethiopian agro-ecological zones';
COMMENT ON COLUMN "livestock_location_type".crop_catalog_ecological_zone_id IS 'Matching ecological_zone.id in the crop catalog (Kolla, Weyna Dega, Dega)';

CREATE TABLE "livestock_body_condition" (
    code TEXT PRIMARY KEY,
    bcs_score INTEGER NOT NULL,
    condition_label TEXT NOT NULL,
    fatness_label TEXT NOT NULL,
    etlits_label TEXT UNIQUE,
    description TEXT
);

COMMENT ON TABLE "livestock_body_condition" IS 'Body condition score scale 1-5 from the National Livestock Data Standard, mapped to the labels used by ET-LITS';
COMMENT ON COLUMN "livestock_body_condition".etlits_label IS 'bodyCondition value used by ET-LITS; NULL where the score has no ET-LITS equivalent';

CREATE TABLE "livestock_production_type" (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    standard_purpose TEXT,
    in_national_standard BOOLEAN NOT NULL DEFAULT FALSE,
    in_etlits_registry BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT
);

COMMENT ON TABLE "livestock_production_type" IS 'Union of national standard production purposes and ET-LITS productionType values';
COMMENT ON COLUMN "livestock_production_type".standard_purpose IS 'Equivalent production purpose in the National Livestock Data Standard, where one exists';

CREATE TABLE "livestock_production_type_species" (
    production_type_code TEXT NOT NULL REFERENCES livestock_production_type(code),
    species_code TEXT NOT NULL REFERENCES livestock_catalog(species_code),
    PRIMARY KEY (production_type_code, species_code)
);

COMMENT ON TABLE "livestock_production_type_species" IS 'Species each production purpose is valid for, per the national standard production purpose table';

CREATE TABLE "livestock_record_status" (
    code TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    sort_order INTEGER NOT NULL,
    is_live_master_data BOOLEAN NOT NULL DEFAULT FALSE,
    description TEXT
);

COMMENT ON TABLE "livestock_record_status" IS 'ET-LITS review workflow states observed on livestock registry records';
COMMENT ON COLUMN "livestock_record_status".is_live_master_data IS 'TRUE only for states whose records should be treated as live reference data';

CREATE TABLE "livestock_registry_entry" (
    id TEXT PRIMARY KEY,
    species_code TEXT NOT NULL REFERENCES livestock_catalog(species_code),
    breed_name TEXT NOT NULL,
    breed_id INTEGER REFERENCES livestock_breed(id),
    gender_code TEXT NOT NULL REFERENCES livestock_gender(code),
    location_type_code TEXT NOT NULL REFERENCES livestock_location_type(code),
    body_condition_code TEXT NOT NULL REFERENCES livestock_body_condition(code),
    production_type_code TEXT NOT NULL REFERENCES livestock_production_type(code),
    status TEXT NOT NULL REFERENCES livestock_record_status(code),
    created_on TIMESTAMPTZ NOT NULL,
    updated_on TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE "livestock_registry_entry" IS 'ET-LITS livestock registry snapshot, with each attribute resolved against the reference tables';
COMMENT ON COLUMN "livestock_registry_entry".breed_name IS 'Raw breed string from ET-LITS, retained even where it does not resolve to a reference breed';
COMMENT ON COLUMN "livestock_registry_entry".breed_id IS 'Resolved livestock_breed.id; NULL where the raw breed string is not a recognised breed';
CREATE INDEX "livestock_registry_entry_species_code_idx" ON "livestock_registry_entry" (species_code);
CREATE INDEX "livestock_registry_entry_status_idx" ON "livestock_registry_entry" (status);
CREATE INDEX "livestock_registry_entry_breed_id_idx" ON "livestock_registry_entry" (breed_id);

CREATE VIEW "livestock_registry_validation" AS
SELECT
    r.id,
    r.status,
    r.species_code,
    r.breed_name,
    b.breed_code,
    b.species_code AS breed_species_code,
    r.production_type_code,
    b.id IS NULL AS breed_unrecognised,
    b.id IS NOT NULL AND NOT b.in_national_standard AS breed_outside_national_standard,
    b.id IS NOT NULL AND b.species_code <> r.species_code AS breed_species_mismatch,
    NOT EXISTS (
        SELECT 1 FROM livestock_production_type_species ps
        WHERE ps.production_type_code = r.production_type_code
          AND ps.species_code = r.species_code
    ) AS production_type_species_mismatch
FROM livestock_registry_entry r
LEFT JOIN livestock_breed b ON b.id = r.breed_id;

COMMENT ON VIEW "livestock_registry_validation" IS 'Flags ET-LITS registry rows whose breed or production type does not agree with the national reference data';
