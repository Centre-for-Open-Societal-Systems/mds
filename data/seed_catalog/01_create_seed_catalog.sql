-- Ethio-Seed seed catalog and demand trend tables
-- Source page: https://ethioseed.moa.gov.et/seed-demand-trend

DROP TABLE IF EXISTS "seed_demand_trend_by_crop" CASCADE;
DROP TABLE IF EXISTS "seed_demand_trend" CASCADE;
DROP TABLE IF EXISTS "seed_demand_summary" CASCADE;
DROP TABLE IF EXISTS "seed_catalog" CASCADE;

CREATE TABLE "seed_catalog" (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL
);

COMMENT ON TABLE "seed_catalog" IS 'Seeds/crops selectable on Ethio-Seed demand trend page';
CREATE INDEX "seed_catalog_name_idx" ON "seed_catalog" (name);

CREATE TABLE "seed_demand_summary" (
    budget_year INTEGER PRIMARY KEY,
    total_entries INTEGER,
    total_quantity_demanded BIGINT,
    average_quantity_per_entry DOUBLE PRECISION,
    total_estimated_land_ha DOUBLE PRECISION,
    average_estimated_land_ha DOUBLE PRECISION
);

COMMENT ON TABLE "seed_demand_summary" IS 'Annual seed demand KPIs from /api/demand-summary/';

CREATE TABLE "seed_demand_trend" (
    id SERIAL PRIMARY KEY,
    budget_year INTEGER NOT NULL,
    seed_class TEXT NOT NULL,
    quantity_demanded BIGINT NOT NULL
);

CREATE UNIQUE INDEX "seed_demand_trend_year_class_uidx" ON "seed_demand_trend" (budget_year, seed_class);

CREATE TABLE "seed_demand_trend_by_crop" (
    id SERIAL PRIMARY KEY,
    crop_id INTEGER NOT NULL REFERENCES seed_catalog(id),
    crop_name TEXT NOT NULL,
    budget_year INTEGER NOT NULL,
    seed_class TEXT NOT NULL,
    quantity_demanded BIGINT NOT NULL
);

CREATE UNIQUE INDEX "seed_demand_trend_by_crop_uidx" ON "seed_demand_trend_by_crop" (crop_id, budget_year, seed_class);
CREATE INDEX "seed_demand_trend_by_crop_year_idx" ON "seed_demand_trend_by_crop" (budget_year);
