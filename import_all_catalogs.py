#!/usr/bin/env python3
import json
import psycopg2

import os

DB_PARAMS = {
    "dbname": os.environ.get("MASTER_DATA_API_DB_DBNAME", "master_data"),
    "user": os.environ.get("MASTER_DATA_API_DB_USERNAME", "postgres"),
    "password": os.environ.get("MASTER_DATA_API_DB_PASSWORD", "password"),
    "host": os.environ.get("MASTER_DATA_API_DB_HOSTNAME", "mds-standalone-postgres"),
    "port": int(os.environ.get("MASTER_DATA_API_DB_PORT", "5432"))
}

def run():
    conn = psycopg2.connect(**DB_PARAMS)
    conn.autocommit = False
    cur = conn.cursor()

    # Disable guards
    cur.execute("ALTER TABLE g2p_list_versions DISABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values DISABLE TRIGGER trg_g2p_list_version_values_guard;")

    # Helper function to create or replace a catalog
    def setup_catalog(catalog_id, display_name, description, domain, is_hierarchical=False, attribute_schema=None):
        print(f"Setting up catalog: {catalog_id} ({display_name})...")
        
        # 1. g2p_attributes
        cur.execute("""
            INSERT INTO g2p_attributes (attribute_id, attribute_code, attribute_display, is_hierarchical, description, domain, visibility, current_version_no)
            VALUES (%s, %s, %s, %s, %s, %s, 'public', 1)
            ON CONFLICT (attribute_id) DO UPDATE SET
                attribute_code = EXCLUDED.attribute_code,
                attribute_display = EXCLUDED.attribute_display,
                is_hierarchical = EXCLUDED.is_hierarchical,
                description = EXCLUDED.description,
                domain = EXCLUDED.domain,
                current_version_no = 1;
        """, (catalog_id, catalog_id, display_name, is_hierarchical, description, domain))

        # 2. g2p_list_versions
        cur.execute("""
            INSERT INTO g2p_list_versions (list_id, version_no, list_code, display, is_hierarchical, attribute_schema, status, effective_from, published_at)
            VALUES (%s, 1, %s, %s, %s, %s, 'PUBLISHED', '1970-01-01 00:00:00+00', NOW())
            ON CONFLICT (list_id, version_no) DO UPDATE SET
                list_code = EXCLUDED.list_code,
                display = EXCLUDED.display,
                is_hierarchical = EXCLUDED.is_hierarchical,
                attribute_schema = EXCLUDED.attribute_schema,
                status = 'PUBLISHED',
                effective_from = '1970-01-01 00:00:00+00';
        """, (catalog_id, catalog_id, display_name, is_hierarchical, json.dumps(attribute_schema) if attribute_schema else None))

        # Clean existing values for this catalog
        cur.execute("DELETE FROM g2p_list_version_values WHERE list_id = %s;", (catalog_id,))

    # 1. CROP_CATEGORY_CATALOG
    setup_catalog(
        "CROP_CATEGORY_CATALOG",
        "Crop Category Catalog",
        "Classification categories for agricultural crops",
        "agriculture",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "category_id": {"type": "integer", "description": "Original category ID"},
                "description": {"type": "string", "description": "Description of crop category"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'CROP_CATEGORY_CATALOG',
            1,
            'CAT_' || id,
            name,
            name,
            id,
            jsonb_build_object(
                'category_id', id,
                'description', COALESCE(description, '')
            ),
            'ACTIVE'
        FROM raw_client.crop_category
        ORDER BY id;
    """)

    # 2. ECOLOGICAL_ZONE_CATALOG
    setup_catalog(
        "ECOLOGICAL_ZONE_CATALOG",
        "Ecological Zone Catalog",
        "Traditional agro-ecological altitude zones of Ethiopia (Kolla, Weyna Dega, Dega)",
        "agriculture",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "zone_id": {"type": "integer", "description": "Zone ID"},
                "altitude_range": {"type": "string", "description": "Altitude description"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'ECOLOGICAL_ZONE_CATALOG',
            1,
            'ZONE_' || id,
            name,
            name,
            id,
            jsonb_build_object(
                'zone_id', id,
                'altitude_range', description
            ),
            'ACTIVE'
        FROM raw_client.ecological_zone
        ORDER BY id;
    """)

    # 3. CROP_VARIETY_CATALOG
    setup_catalog(
        "CROP_VARIETY_CATALOG",
        "Crop Variety Catalog",
        "National registered seed and crop varieties with breeder, maintainer and release year",
        "agriculture",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "crop_id": {"type": "integer", "description": "Linked crop ID"},
                "crop_name": {"type": "string", "description": "Parent crop name"},
                "release_year": {"type": "integer", "description": "Year of variety release"},
                "release_date": {"type": "string", "description": "Official release date"},
                "maintainer": {"type": "string", "description": "Research center or maintainer institution"},
                "source": {"type": "string", "description": "Domestic or imported origin"},
                "details_url": {"type": "string", "description": "EthioSeed portal URL"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'CROP_VARIETY_CATALOG',
            1,
            'VARIETY_' || id,
            common_name,
            common_name,
            crop_name,
            id,
            jsonb_build_object(
                'crop_id', crop_id,
                'crop_name', crop_name,
                'category', COALESCE(category, ''),
                'release_year', release_year,
                'release_date', release_date::text,
                'maintainer', COALESCE(maintainer, ''),
                'source', COALESCE(source, ''),
                'details_url', COALESCE(details_url, '')
            ),
            'ACTIVE'
        FROM raw_client.crop_variety
        ORDER BY id;
    """)

    # 4. SEED_DEMAND_SUMMARY_CATALOG
    setup_catalog(
        "SEED_DEMAND_SUMMARY_CATALOG",
        "Seed Demand Summary Catalog",
        "Aggregated national seed demand summary metrics by budget year",
        "agriculture",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "budget_year": {"type": "integer"},
                "total_entries": {"type": "integer"},
                "total_quantity_demanded": {"type": "number"},
                "average_quantity_per_entry": {"type": "number"},
                "total_estimated_land_ha": {"type": "number"},
                "average_estimated_land_ha": {"type": "number"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'SEED_DEMAND_SUMMARY_CATALOG',
            1,
            'SUMMARY_' || budget_year,
            budget_year::text,
            'National Seed Demand (' || budget_year || ')',
            1,
            jsonb_build_object(
                'budget_year', budget_year,
                'total_entries', total_entries,
                'total_quantity_demanded', total_quantity_demanded,
                'average_quantity_per_entry', average_quantity_per_entry,
                'total_estimated_land_ha', total_estimated_land_ha,
                'average_estimated_land_ha', average_estimated_land_ha
            ),
            'ACTIVE'
        FROM raw_client.seed_demand_summary;
    """)

    # 5. SEED_DEMAND_TREND_CATALOG
    setup_catalog(
        "SEED_DEMAND_TREND_CATALOG",
        "Seed Demand Trend Catalog",
        "Seed class demand metrics by budget year (Basic, Breeder, Certified C1)",
        "agriculture",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "budget_year": {"type": "integer"},
                "seed_class": {"type": "string"},
                "quantity_demanded": {"type": "number"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'SEED_DEMAND_TREND_CATALOG',
            1,
            'TREND_' || id,
            seed_class || '_' || budget_year,
            seed_class || ' (' || budget_year || ')',
            id,
            jsonb_build_object(
                'budget_year', budget_year,
                'seed_class', seed_class,
                'quantity_demanded', quantity_demanded
            ),
            'ACTIVE'
        FROM raw_client.seed_demand_trend
        ORDER BY id;
    """)

    # 6. SEED_DEMAND_BY_CROP_CATALOG
    setup_catalog(
        "SEED_DEMAND_BY_CROP_CATALOG",
        "Seed Demand by Crop Catalog",
        "Seed demand breakdown segmented by crop and seed class",
        "agriculture",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "crop_id": {"type": "integer"},
                "crop_name": {"type": "string"},
                "budget_year": {"type": "integer"},
                "seed_class": {"type": "string"},
                "quantity_demanded": {"type": "number"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'SEED_DEMAND_BY_CROP_CATALOG',
            1,
            'DEMAND_CROP_' || id,
            crop_name || '_' || seed_class || '_' || budget_year,
            crop_name || ' - ' || seed_class || ' (' || budget_year || ')',
            crop_name,
            id,
            jsonb_build_object(
                'crop_id', crop_id,
                'crop_name', crop_name,
                'budget_year', budget_year,
                'seed_class', seed_class,
                'quantity_demanded', quantity_demanded
            ),
            'ACTIVE'
        FROM raw_client.seed_demand_trend_by_crop
        ORDER BY id;
    """)

    # 7. LIVESTOCK_BREED_CATALOG
    setup_catalog(
        "LIVESTOCK_BREED_CATALOG",
        "Livestock Breed Catalog",
        "Official national livestock breeds linked to parent species",
        "livestock",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "breed_code": {"type": "string"},
                "abbreviation": {"type": "string"},
                "species_code": {"type": "string"},
                "breed_type": {"type": "string"},
                "in_national_standard": {"type": "boolean"},
                "in_etlits_registry": {"type": "boolean"},
                "source": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_BREED_CATALOG',
            1,
            'BREED_' || id,
            COALESCE(breed_code, 'BREED_' || id),
            name,
            species_code,
            id,
            jsonb_build_object(
                'breed_code', breed_code,
                'abbreviation', abbreviation,
                'species_code', species_code,
                'breed_type', breed_type,
                'in_national_standard', in_national_standard,
                'in_etlits_registry', in_etlits_registry,
                'source', source
            ),
            'ACTIVE'
        FROM raw_client.livestock_breed
        ORDER BY id;
    """)

    # 8. LIVESTOCK_POPULATION_CATALOG
    setup_catalog(
        "LIVESTOCK_POPULATION_CATALOG",
        "Livestock Population Catalog",
        "National census livestock population statistics by species and year",
        "livestock",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "species_code": {"type": "string"},
                "census_year": {"type": "integer"},
                "population_total": {"type": "number"},
                "source_record_count": {"type": "integer"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_POPULATION_CATALOG',
            1,
            'POP_' || id,
            species_code || '_' || census_year,
            species_code || ' (' || census_year || ')',
            species_code,
            id,
            jsonb_build_object(
                'species_code', species_code,
                'census_year', census_year,
                'population_total', population_total,
                'source_record_count', source_record_count
            ),
            'ACTIVE'
        FROM raw_client.livestock_population
        ORDER BY id;
    """)

    # 9. LIVESTOCK_GENDER_CATALOG
    setup_catalog(
        "LIVESTOCK_GENDER_CATALOG",
        "Livestock Gender Catalog",
        "National sex and reproduction enumerations (Female, Male, Neutered)",
        "livestock",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "in_etlits_registry": {"type": "boolean"},
                "description": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_GENDER_CATALOG',
            1,
            'GENDER_' || code,
            code,
            name,
            row_number() over (order by code),
            jsonb_build_object(
                'in_etlits_registry', in_etlits_registry,
                'description', description
            ),
            'ACTIVE'
        FROM raw_client.livestock_gender
        ORDER BY code;
    """)

    # 10. LIVESTOCK_LOCATION_TYPE_CATALOG
    setup_catalog(
        "LIVESTOCK_LOCATION_TYPE_CATALOG",
        "Livestock Location Type Catalog",
        "Livestock agro-ecological zones (High Land, Low Land, Mid Land)",
        "livestock",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "ethiopian_zone_name": {"type": "string"},
                "altitude_description": {"type": "string"},
                "crop_catalog_ecological_zone_id": {"type": "integer"},
                "description": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_LOCATION_TYPE_CATALOG',
            1,
            'LOC_' || replace(code, ' ', '_'),
            code,
            name,
            row_number() over (order by code),
            jsonb_build_object(
                'ethiopian_zone_name', ethiopian_zone_name,
                'altitude_description', altitude_description,
                'crop_catalog_ecological_zone_id', crop_catalog_ecological_zone_id,
                'description', description
            ),
            'ACTIVE'
        FROM raw_client.livestock_location_type
        ORDER BY code;
    """)

    # 11. LIVESTOCK_BODY_CONDITION_CATALOG
    setup_catalog(
        "LIVESTOCK_BODY_CONDITION_CATALOG",
        "Livestock Body Condition Catalog",
        "Standard Body Condition Scores (BCS 1 to 5) for animal health assessments",
        "livestock",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "bcs_score": {"type": "integer"},
                "condition_label": {"type": "string"},
                "fatness_label": {"type": "string"},
                "etlits_label": {"type": "string"},
                "description": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_BODY_CONDITION_CATALOG',
            1,
            'BCS_' || code,
            code,
            code || ' - ' || condition_label || ' (' || fatness_label || ')',
            bcs_score,
            jsonb_build_object(
                'bcs_score', bcs_score,
                'condition_label', condition_label,
                'fatness_label', fatness_label,
                'etlits_label', COALESCE(etlits_label, ''),
                'description', description
            ),
            'ACTIVE'
        FROM raw_client.livestock_body_condition
        ORDER BY bcs_score;
    """)

    # 12. LIVESTOCK_PRODUCTION_TYPE_CATALOG
    setup_catalog(
        "LIVESTOCK_PRODUCTION_TYPE_CATALOG",
        "Livestock Production Type Catalog",
        "Livestock production purposes (Breeding, Draft Power, Meat, Milk, Wool, Honey)",
        "livestock",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "standard_purpose": {"type": "string"},
                "in_national_standard": {"type": "boolean"},
                "in_etlits_registry": {"type": "boolean"},
                "description": {"type": "string"},
                "species": {"type": "array", "items": {"type": "string"}}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_PRODUCTION_TYPE_CATALOG',
            1,
            'PROD_' || replace(replace(p.code, ' ', '_'), '/', '_'),
            p.code,
            p.name,
            row_number() over (order by p.code),
            jsonb_build_object(
                'standard_purpose', COALESCE(p.standard_purpose, ''),
                'in_national_standard', p.in_national_standard,
                'in_etlits_registry', p.in_etlits_registry,
                'description', p.description,
                'applicable_species', COALESCE((
                    SELECT json_agg(s.species_code) 
                    FROM raw_client.livestock_production_type_species s 
                    WHERE s.production_type_code = p.code
                ), '[]'::json)
            ),
            'ACTIVE'
        FROM raw_client.livestock_production_type p
        ORDER BY p.code;
    """)

    # 13. LIVESTOCK_RECORD_STATUS_CATALOG
    setup_catalog(
        "LIVESTOCK_RECORD_STATUS_CATALOG",
        "Livestock Record Status Catalog",
        "Workflow states for livestock registry records (Pending, Active, Approved, etc.)",
        "livestock",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "is_live_master_data": {"type": "boolean"},
                "description": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_RECORD_STATUS_CATALOG',
            1,
            'STATUS_' || code,
            code,
            name,
            sort_order,
            jsonb_build_object(
                'is_live_master_data', is_live_master_data,
                'description', description
            ),
            'ACTIVE'
        FROM raw_client.livestock_record_status
        ORDER BY sort_order;
    """)

    # 14. LIVESTOCK_REGISTRY_ENTRY_CATALOG
    setup_catalog(
        "LIVESTOCK_REGISTRY_ENTRY_CATALOG",
        "Livestock Registry Entry Catalog",
        "Registered animal records in national ET-LITS livestock registry",
        "livestock",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "species_code": {"type": "string"},
                "breed_name": {"type": "string"},
                "breed_id": {"type": "integer"},
                "gender_code": {"type": "string"},
                "location_type_code": {"type": "string"},
                "body_condition_code": {"type": "string"},
                "production_type_code": {"type": "string"},
                "status": {"type": "string"},
                "created_on": {"type": "string"},
                "updated_on": {"type": "string"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'LIVESTOCK_REGISTRY_ENTRY_CATALOG',
            1,
            'REG_' || id,
            id,
            id || ' (' || species_code || ' - ' || breed_name || ')',
            species_code,
            row_number() over (order by created_on),
            jsonb_build_object(
                'species_code', species_code,
                'breed_name', breed_name,
                'breed_id', breed_id,
                'gender_code', gender_code,
                'location_type_code', location_type_code,
                'body_condition_code', body_condition_code,
                'production_type_code', production_type_code,
                'status', status,
                'created_on', created_on::text,
                'updated_on', updated_on::text
            ),
            'ACTIVE'
        FROM raw_client.livestock_registry_entry
        ORDER BY created_on;
    """)

    # Re-enable triggers
    cur.execute("ALTER TABLE g2p_list_versions ENABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values ENABLE TRIGGER trg_g2p_list_version_values_guard;")

    conn.commit()
    cur.close()
    conn.close()
    print("All catalogs imported successfully!")

if __name__ == '__main__':
    run()
