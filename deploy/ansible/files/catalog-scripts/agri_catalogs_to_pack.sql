-- Converts the OAN catalogue seed data (oan_catalog_master_data_management/scripts/seed_db_sql,
-- loaded into a scratch database on top of its scripts/migrations) into Master Data
-- country-pack lists: one row per list -> "<domain>/<file>.json<TAB><json>".
--
-- Run with: psql -d catalogue_scratch -tA -F $'\t' -f agri_catalogs_to_pack.sql
-- The output is written under <pack>/domains/ and loaded by the official MDS loader
-- (load_geo_pack.py --load codelists --domains crops,livestock,seeds).
--
-- Value codes are derived from the source ids/codes, so re-running is idempotent:
-- an unchanged list is a no-op, a changed one becomes a draft for approval.
-- Links to other lists (crop -> category, variety -> crop, breed -> species ...) are kept
-- in each value's "attributes" as the other list's value code.

WITH lists(domain, file, doc) AS (
  -- ===================================================================== crops
  SELECT 'crops', 'crop_category', jsonb_build_object(
    'attribute_id', 'CROP_CATEGORY', 'attribute_display', 'Crop categories',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'CROPCAT_' || id, 'value_display', name, 'sort_order', id,
        'attributes', jsonb_strip_nulls(jsonb_build_object('description', description))))
      ORDER BY id) FROM g2p_crop_category))
  UNION ALL
  SELECT 'crops', 'ecological_zone', jsonb_build_object(
    'attribute_id', 'ECOLOGICAL_ZONE', 'attribute_display', 'Ecological zones',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'ECOZONE_' || id, 'value_display', name, 'sort_order', id,
        'attributes', jsonb_strip_nulls(jsonb_build_object('description', description))))
      ORDER BY id) FROM g2p_ecological_zone))
  UNION ALL
  SELECT 'crops', 'crop_catalog', jsonb_build_object(
    'attribute_id', 'CROP_CATALOG', 'attribute_display', 'Crop catalog',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'CROP_' || id, 'value_display', name, 'sort_order', id,
        'display_i18n', CASE WHEN display_name_amh IS NOT NULL THEN jsonb_build_object('am', display_name_amh) END,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'category', 'CROPCAT_' || category_id,
          'preferred_ecological_zone', 'ECOZONE_' || preferred_ecological_zone_id,
          'scientific_name', scientific_name, 'description', description, 'known_for', known_for,
          'centre', centre, 'varieties_count', varieties_count,
          'num_field_inspection_needed', num_field_inspection_needed,
          'isolation_distance', isolation_distance, 'image_url', image_url,
          'taxonomy_type_code', taxonomy_type_code, 'taxonomy_category_code', taxonomy_category_code,
          'record_source', record_source))))
      ORDER BY id) FROM g2p_crop))
  UNION ALL
  SELECT 'crops', 'crop_variety', jsonb_build_object(
    'attribute_id', 'CROP_VARIETY', 'attribute_display', 'Crop varieties',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'VARIETY_' || source_variety_id,
        'value_display', coalesce(common_name_raw, crop_name_raw || ' variety ' || source_variety_id),
        'sort_order', source_variety_id,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'crop', 'CROP_' || crop_id, 'certified_seed', 'SEED_' || seed_crop_id,
          'crop_name', crop_name_raw, 'category', category_raw,
          'release_year', release_year, 'release_date', release_date, 'maintainer', maintainer,
          'classification', source_classification, 'details_url', details_url))))
      ORDER BY source_variety_id) FROM g2p_seed_variety_source_record))
  -- ================================================================= livestock
  UNION ALL
  SELECT 'livestock', 'livestock_species_catalog', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_SPECIES_CATALOG', 'attribute_display', 'Livestock species',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'SPECIES_' || upper(species_code), 'value_display', name, 'sort_order', id,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'description', description, 'scientific_name', scientific_name, 'subfamily', subfamily,
          'ear_tag_range', ear_tag_range, 'in_lis_population', in_lis_population,
          'in_etlits_registry', in_etlits_registry))))
      ORDER BY id) FROM g2p_livestock_type))
  UNION ALL
  SELECT 'livestock', 'livestock_breed_catalog', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_BREED_CATALOG', 'attribute_display', 'Livestock breeds',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'BREED_' || b.id, 'value_code', coalesce(b.breed_code, 'BREED_' || b.id),
        'value_display', b.name, 'sort_order', b.id,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'species', 'SPECIES_' || upper(t.species_code), 'abbreviation', b.abbreviation,
          'breed_type', b.breed_type, 'in_national_standard', b.in_national_standard,
          'in_etlits_registry', b.in_etlits_registry, 'source', b.source))))
      ORDER BY b.id) FROM g2p_livestock_breed b LEFT JOIN g2p_livestock_type t ON t.id = b.species_id))
  UNION ALL
  SELECT 'livestock', 'livestock_population', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_POPULATION', 'attribute_display', 'Livestock populations (census)',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'POP_' || upper(t.species_code) || '_' || p.census_year,
        'value_display', t.name || ' ' || p.census_year || ': ' || to_char(p.population_total, 'FM999,999,999,999'),
        'sort_order', p.rn,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'species', 'SPECIES_' || upper(t.species_code), 'census_year', p.census_year,
          'population_total', p.population_total, 'source_record_count', p.source_record_count))))
      ORDER BY t.id, p.census_year)
      FROM (SELECT *, row_number() OVER (ORDER BY species_code, census_year) rn FROM g2p_livestock_population) p
      JOIN g2p_livestock_type t ON t.id = p.species_code))
  UNION ALL
  SELECT 'livestock', 'livestock_gender', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_GENDER', 'attribute_display', 'Livestock genders',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'GENDER_' || upper(regexp_replace(code, '\W+', '_', 'g')), 'value_display', name,
        'sort_order', rn,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'source_code', code, 'description', description, 'in_etlits_registry', in_etlits_registry))))
      ORDER BY rn) FROM (SELECT *, row_number() OVER (ORDER BY code) rn FROM g2p_livestock_gender) g))
  UNION ALL
  SELECT 'livestock', 'livestock_production_type', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_PRODUCTION_TYPE', 'attribute_display', 'Livestock production types',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'PROD_' || upper(regexp_replace(code, '\W+', '_', 'g')), 'value_display', name,
        'sort_order', rn,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'source_code', code, 'standard_purpose', standard_purpose, 'description', description,
          'in_national_standard', in_national_standard, 'in_etlits_registry', in_etlits_registry,
          'species', (SELECT jsonb_agg('SPECIES_' || upper(t.species_code) ORDER BY t.id)
                      FROM g2p_livestock_production_type_species s
                      JOIN g2p_livestock_type t ON t.id = s.species_id
                      WHERE s.production_type_code = p.code)))))
      ORDER BY rn) FROM (SELECT *, row_number() OVER (ORDER BY code) rn FROM g2p_livestock_production_type) p))
  UNION ALL
  SELECT 'livestock', 'livestock_body_condition', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_BODY_CONDITION', 'attribute_display', 'Livestock body conditions',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', code, 'value_display', code || ' - ' || condition_label, 'sort_order', bcs_score,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'bcs_score', bcs_score, 'condition_label', condition_label, 'fatness_label', fatness_label,
          'etlits_label', etlits_label, 'description', description))))
      ORDER BY bcs_score) FROM g2p_livestock_body_condition))
  UNION ALL
  SELECT 'livestock', 'livestock_record_status', jsonb_build_object(
    'attribute_id', 'LIVESTOCK_RECORD_STATUS', 'attribute_display', 'Livestock record statuses',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'STATUS_' || upper(code), 'value_display', name, 'sort_order', sort_order,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'source_code', code, 'is_live_master_data', is_live_master_data, 'description', description))))
      ORDER BY sort_order) FROM g2p_livestock_record_status))
  -- ===================================================================== seeds
  UNION ALL
  SELECT 'seeds', 'certified_seed_catalog', jsonb_build_object(
    'attribute_id', 'CERTIFIED_SEED_CATALOG', 'attribute_display', 'Certified seed catalog',
    'values', (SELECT jsonb_agg(jsonb_build_object(
        'value_id', 'SEED_' || id, 'value_display', name, 'sort_order', id) ORDER BY id) FROM g2p_seed_catalog))
  UNION ALL
  SELECT 'seeds', 'seed_demand_summary', jsonb_build_object(
    'attribute_id', 'SEED_DEMAND_SUMMARY', 'attribute_display', 'Seed demand summary',
    'values', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'value_id', 'DEMAND_' || budget_year,
        'value_display', 'Budget year ' || budget_year || ': ' || to_char(total_quantity_demanded, 'FM999,999,999,999') || ' demanded',
        'sort_order', budget_year,
        'attributes', jsonb_strip_nulls(jsonb_build_object(
          'budget_year', budget_year, 'total_entries', total_entries,
          'total_quantity_demanded', total_quantity_demanded, 'average_quantity_per_entry', average_quantity_per_entry,
          'total_estimated_land_ha', total_estimated_land_ha, 'average_estimated_land_ha', average_estimated_land_ha))))
      ORDER BY budget_year) FROM g2p_seed_demand_summary))
  UNION ALL
  SELECT 'seeds', 'seed_demand_trend', jsonb_build_object(
    'attribute_id', 'SEED_DEMAND_TREND', 'attribute_display', 'Seed demand trend',
    'values', (SELECT jsonb_agg(jsonb_build_object(
        'value_id', 'TREND_' || budget_year || '_' || upper(regexp_replace(seed_class, '\W+', '_', 'g')),
        'value_display', budget_year || ' ' || seed_class || ': ' || to_char(quantity_demanded, 'FM999,999,999,999'),
        'sort_order', rn,
        'attributes', jsonb_build_object('budget_year', budget_year, 'seed_class', seed_class,
                                         'quantity_demanded', quantity_demanded))
      ORDER BY rn) FROM (SELECT *, row_number() OVER (ORDER BY budget_year, seed_class) rn FROM g2p_seed_demand_trend) t))
  UNION ALL
  SELECT 'seeds', 'seed_demand_by_crop', jsonb_build_object(
    'attribute_id', 'SEED_DEMAND_BY_CROP', 'attribute_display', 'Seed demand by crop',
    'values', (SELECT jsonb_agg(jsonb_build_object(
        'value_id', 'CROPDEMAND_' || crop_id || '_' || budget_year || '_' || upper(regexp_replace(seed_class, '\W+', '_', 'g')),
        'value_display', crop_name || ' ' || budget_year || ' ' || seed_class || ': ' || to_char(quantity_demanded, 'FM999,999,999,999'),
        'sort_order', rn,
        'attributes', jsonb_build_object('certified_seed', 'SEED_' || crop_id, 'budget_year', budget_year,
                                         'seed_class', seed_class, 'quantity_demanded', quantity_demanded))
      ORDER BY rn) FROM (SELECT *, row_number() OVER (ORDER BY crop_id, budget_year, seed_class) rn
                         FROM g2p_seed_demand_trend_by_crop) d))
)
SELECT domain || '/' || file || '.json', jsonb_set(doc, '{attribute_code}', doc -> 'attribute_id')::text
FROM lists ORDER BY 1;
