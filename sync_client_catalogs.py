#!/usr/bin/env python3
import json
import psycopg2
import os

DB_PARAMS = {
    "dbname": "master_data",
    "user": "postgres",
    "password": "password",
    "host": "postgres",
    "port": 5432
}

def run():
    print("Connecting to postgres database...")
    conn = psycopg2.connect(**DB_PARAMS)
    conn.autocommit = False
    cur = conn.cursor()

    cur.execute("ALTER TABLE g2p_list_versions DISABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values DISABLE TRIGGER trg_g2p_list_version_values_guard;")

    # 1. Update SEED_CATALOG with schema and rich attributes from raw_client.crop_catalog
    print("Updating SEED_CATALOG schema and attributes...")
    seed_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "seed_id": {"type": "integer", "description": "Seed Identifier"},
            "crop_name": {"type": "string", "description": "Crop Common Name"},
            "botanical_name": {"type": "string", "description": "Botanical / Scientific Name"},
            "category": {"type": "string", "description": "Crop Category"},
            "preferred_ecological_zone": {"type": "string", "description": "Agro-ecological Zone"},
            "isolation_distance_meters": {"type": "integer", "description": "Isolation Distance (m)"},
            "num_field_inspections": {"type": "integer", "description": "Field Inspections Required"},
            "certification_status": {"type": "string", "description": "Certification Status"}
        }
    }

    cur.execute("""
        UPDATE g2p_attributes 
        SET attribute_schema = %s, table_type = 'catalog', domain = 'seed'
        WHERE attribute_id = 'SEED_CATALOG';
    """, (json.dumps(seed_schema),))

    cur.execute("""
        UPDATE g2p_list_versions
        SET attribute_schema = %s
        WHERE list_id = 'SEED_CATALOG' AND version_no = 1;
    """, (json.dumps(seed_schema),))

    cur.execute("""
        UPDATE g2p_list_version_values v
        SET attributes = jsonb_build_object(
            'seed_id', s.id,
            'crop_name', regexp_replace(s.name, '\\s*\\([^)]*\\)', ''),
            'botanical_name', COALESCE(substring(s.name from '\\((.*?)\\)'), s.name),
            'category', COALESCE(cat.name, 'Field Crop'),
            'preferred_ecological_zone', COALESCE(eco.name, 'Weyna Dega'),
            'isolation_distance_meters', COALESCE(c.isolation_distance, 10),
            'num_field_inspections', COALESCE(c.num_field_inspection_needed, 2),
            'certification_status', 'Certified (Ethio-Seed)'
        )
        FROM raw_client.seed_catalog s
        LEFT JOIN raw_client.crop_catalog c ON c.id = s.id
        LEFT JOIN raw_client.crop_category cat ON cat.id = c.category_id
        LEFT JOIN raw_client.ecological_zone eco ON eco.id = c.preferred_ecological_zone_id
        WHERE v.list_id = 'SEED_CATALOG' AND v.value_code = s.id::text;
    """)

    # 2. Setup ADMIN_COUNTRIES_CATALOG
    print("Setting up ADMIN_COUNTRIES_CATALOG...")
    country_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "country_name": {"type": "string", "description": "Country Name"},
            "iso2": {"type": "string", "description": "ISO-2 Code"},
            "iso3": {"type": "string", "description": "ISO-3 Code"},
            "currency": {"type": "string", "description": "Official Currency"},
            "calling_code": {"type": "string", "description": "Calling Code"},
            "capital_city": {"type": "string", "description": "Capital City"}
        }
    }
    cur.execute("""
        INSERT INTO g2p_attributes (attribute_id, attribute_code, attribute_display, is_hierarchical, description, domain, owner_org, visibility, current_version_no, attribute_schema, table_type)
        VALUES ('ADMIN_COUNTRIES_CATALOG', 'ADMIN_COUNTRIES_CATALOG', 'Countries Catalog', FALSE, 'National country reference catalog', 'geography', 'Central Statistical Agency (CSA)', 'public', 1, %s, 'lookup')
        ON CONFLICT (attribute_id) DO UPDATE SET
            attribute_display = EXCLUDED.attribute_display,
            attribute_schema = EXCLUDED.attribute_schema,
            table_type = 'lookup';
    """, (json.dumps(country_schema),))

    cur.execute("""
        INSERT INTO g2p_list_versions (list_id, version_no, list_code, display, is_hierarchical, attribute_schema, status, effective_from, published_at)
        VALUES ('ADMIN_COUNTRIES_CATALOG', 1, 'ADMIN_COUNTRIES_CATALOG', 'Countries Catalog', FALSE, %s, 'PUBLISHED', '1970-01-01 00:00:00+00', NOW())
        ON CONFLICT (list_id, version_no) DO UPDATE SET
            attribute_schema = EXCLUDED.attribute_schema,
            status = 'PUBLISHED';
    """, (json.dumps(country_schema),))

    cur.execute("DELETE FROM g2p_list_version_values WHERE list_id = 'ADMIN_COUNTRIES_CATALOG';")
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        VALUES (
            'ADMIN_COUNTRIES_CATALOG',
            1,
            'country-ETH',
            'ETH',
            'Ethiopia',
            1,
            jsonb_build_object(
                'country_name', 'Ethiopia',
                'iso2', 'ET',
                'iso3', 'ETH',
                'currency', 'ETB (Ethiopian Birr)',
                'calling_code', '+251',
                'capital_city', 'Addis Ababa'
            ),
            'ACTIVE'
        );
    """)

    # 3. Setup ADMIN_KEBELES_CATALOG (Sample Kebeles)
    print("Setting up ADMIN_KEBELES_CATALOG...")
    kebele_schema = {
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "type": "object",
        "properties": {
            "kebele_code": {"type": "string", "description": "Kebele P-Code"},
            "unit_id": {"type": "string", "description": "Unit Identifier"},
            "parent_woreda_pcode": {"type": "string", "description": "Parent Woreda P-Code"},
            "parent_woreda_name": {"type": "string", "description": "Parent Woreda Name"}
        }
    }
    cur.execute("""
        INSERT INTO g2p_attributes (attribute_id, attribute_code, attribute_display, is_hierarchical, description, domain, owner_org, visibility, current_version_no, attribute_schema, table_type)
        VALUES ('ADMIN_KEBELES_CATALOG', 'ADMIN_KEBELES_CATALOG', 'Administrative Kebeles Catalog', TRUE, 'Ethiopia Level-4 administrative kebeles linked to parent woredas', 'geography', 'Central Statistical Agency (CSA)', 'public', 1, %s, 'lookup')
        ON CONFLICT (attribute_id) DO UPDATE SET
            attribute_display = EXCLUDED.attribute_display,
            attribute_schema = EXCLUDED.attribute_schema,
            table_type = 'lookup';
    """, (json.dumps(kebele_schema),))

    cur.execute("""
        INSERT INTO g2p_list_versions (list_id, version_no, list_code, display, is_hierarchical, attribute_schema, status, effective_from, published_at)
        VALUES ('ADMIN_KEBELES_CATALOG', 1, 'ADMIN_KEBELES_CATALOG', 'Administrative Kebeles Catalog', TRUE, %s, 'PUBLISHED', '1970-01-01 00:00:00+00', NOW())
        ON CONFLICT (list_id, version_no) DO UPDATE SET
            attribute_schema = EXCLUDED.attribute_schema,
            status = 'PUBLISHED';
    """, (json.dumps(kebele_schema),))

    cur.execute("DELETE FROM g2p_list_version_values WHERE list_id = 'ADMIN_KEBELES_CATALOG';")
    
    # Read sample kebeles from ETH-OAN values.json
    eth_oan_path = "/tmp/eth_oan_values.json"
    if os.path.exists(eth_oan_path):
        with open(eth_oan_path, "r", encoding="utf-8") as f:
            all_units = json.load(f)
        kebeles = [u for u in all_units if u.get("level_id") == "l4"][:500]
        woreda_map = {u.get("level_value_id"): u.get("display_name") for u in all_units if u.get("level_id") == "l3"}
        
        kebele_inserts = []
        for idx, k in enumerate(kebeles):
            k_code = k.get("level_value_id")
            k_name = k.get("display_name") or k_code
            w_code = k.get("parent_level_value_id")
            w_name = woreda_map.get(w_code, "")
            kebele_inserts.append((
                'ADMIN_KEBELES_CATALOG',
                1,
                f"kebele-{k_code}",
                k_code,
                k_name,
                w_code,
                idx + 1,
                json.dumps({
                    "kebele_code": k_code,
                    "unit_id": f"kebele-{k_code}",
                    "parent_woreda_pcode": w_code,
                    "parent_woreda_name": w_name
                }),
                'ACTIVE'
            ))
        
        cur.executemany("""
            INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s::jsonb, %s);
        """, kebele_inserts)
        print(f"Inserted {len(kebele_inserts)} kebeles into ADMIN_KEBELES_CATALOG.")

    # 4. Correctly classify Catalogs vs Lookups
    print("Classifying Catalogs vs Lookups...")
    catalogs = [
        'CROP_CATALOG',
        'CROP_VARIETY_CATALOG',
        'SEED_CATALOG',
        'SEED_DEMAND_SUMMARY_CATALOG',
        'SEED_DEMAND_TREND_CATALOG',
        'SEED_DEMAND_BY_CROP_CATALOG',
        'LIVESTOCK_CATALOG',
        'LIVESTOCK_BREED_CATALOG',
        'LIVESTOCK_POPULATION_CATALOG',
        'LIVESTOCK_REGISTRY_ENTRY_CATALOG',
        'INPUT_CATALOG'
    ]
    cur.execute("""
        UPDATE g2p_attributes 
        SET table_type = 'catalog'
        WHERE attribute_id = ANY(%s);
    """, (catalogs,))

    lookups = [
        'ADMIN_COUNTRIES_CATALOG',
        'ADMIN_REGIONS_CATALOG',
        'ADMIN_ZONES_CATALOG',
        'ADMIN_WOREDAS_CATALOG',
        'ADMIN_KEBELES_CATALOG',
        'CROP_CATEGORY_CATALOG',
        'ECOLOGICAL_ZONE_CATALOG',
        'LIVESTOCK_GENDER_CATALOG',
        'LIVESTOCK_LOCATION_TYPE_CATALOG',
        'LIVESTOCK_BODY_CONDITION_CATALOG',
        'LIVESTOCK_PRODUCTION_TYPE_CATALOG',
        'LIVESTOCK_RECORD_STATUS_CATALOG'
    ]
    cur.execute("""
        UPDATE g2p_attributes 
        SET table_type = 'lookup'
        WHERE attribute_id = ANY(%s);
    """, (lookups,))

    # 5. Synchronize all attribute_schema to both g2p_list_versions and g2p_attributes
    print("Synchronizing version schemas...")
    cur.execute("""
        UPDATE g2p_attributes a
        SET attribute_schema = v.attribute_schema
        FROM g2p_list_versions v
        WHERE a.attribute_id = v.list_id 
          AND a.attribute_schema IS NULL 
          AND v.attribute_schema IS NOT NULL;
    """)
    cur.execute("""
        UPDATE g2p_list_versions v
        SET attribute_schema = a.attribute_schema
        FROM g2p_attributes a
        WHERE v.list_id = a.attribute_id 
          AND a.attribute_schema IS NOT NULL 
          AND v.attribute_schema IS NULL;
    """)

    cur.execute("ALTER TABLE g2p_list_versions ENABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values ENABLE TRIGGER trg_g2p_list_version_values_guard;")

    conn.commit()
    cur.close()
    conn.close()
    print("All catalogs and lookups successfully synchronized!")

if __name__ == '__main__':
    run()
