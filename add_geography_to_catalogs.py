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

    cur.execute("ALTER TABLE g2p_list_versions DISABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values DISABLE TRIGGER trg_g2p_list_version_values_guard;")

    def setup_catalog(catalog_id, display_name, description, domain="geography", is_hierarchical=False, attribute_schema=None):
        print(f"Setting up geography catalog: {catalog_id} ({display_name})...")
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

        cur.execute("DELETE FROM g2p_list_version_values WHERE list_id = %s;", (catalog_id,))

    # 1. Administrative Regions Catalog
    setup_catalog(
        "ADMIN_REGIONS_CATALOG",
        "Administrative Regions Catalog",
        "Ethiopia Level-1 administrative boundaries (14 National Regional States and Chartered Cities)",
        "geography",
        is_hierarchical=False,
        attribute_schema={
            "type": "object",
            "properties": {
                "unit_id": {"type": "string", "description": "System unit identifier"},
                "pcode": {"type": "string", "description": "National P-code"},
                "country": {"type": "string", "description": "Country name"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, sort_order, attributes, status)
        SELECT 
            'ADMIN_REGIONS_CATALOG',
            1,
            unit_id,
            REPLACE(unit_id, 'region-', ''),
            name,
            row_number() OVER (ORDER BY name),
            jsonb_build_object(
                'unit_id', unit_id,
                'pcode', REPLACE(unit_id, 'region-', ''),
                'level', 'region',
                'country', 'Ethiopia'
            ),
            'ACTIVE'
        FROM g2p_geo_version_units
        WHERE level_id = 'level-region' AND version_no = 1
        ORDER BY name;
    """)

    # 2. Administrative Zones Catalog
    setup_catalog(
        "ADMIN_ZONES_CATALOG",
        "Administrative Zones Catalog",
        "Ethiopia Level-2 administrative zones (125 administrative zones) linked to parent regions",
        "geography",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "unit_id": {"type": "string", "description": "System unit identifier"},
                "pcode": {"type": "string", "description": "National P-code"},
                "parent_region_pcode": {"type": "string", "description": "Parent region P-code"},
                "parent_region_name": {"type": "string", "description": "Parent region name"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'ADMIN_ZONES_CATALOG',
            1,
            z.unit_id,
            REPLACE(z.unit_id, 'zone-', ''),
            z.name,
            REPLACE(z.parent_unit_id, 'region-', ''),
            row_number() OVER (ORDER BY z.name),
            jsonb_build_object(
                'unit_id', z.unit_id,
                'pcode', REPLACE(z.unit_id, 'zone-', ''),
                'parent_region_pcode', REPLACE(z.parent_unit_id, 'region-', ''),
                'parent_region_name', COALESCE(r.name, '')
            ),
            'ACTIVE'
        FROM g2p_geo_version_units z
        LEFT JOIN g2p_geo_version_units r ON z.parent_unit_id = r.unit_id AND r.version_no = 1
        WHERE z.level_id = 'level-zone' AND z.version_no = 1
        ORDER BY z.name;
    """)

    # 3. Administrative Woredas Catalog
    setup_catalog(
        "ADMIN_WOREDAS_CATALOG",
        "Administrative Woredas Catalog",
        "Ethiopia Level-3 administrative woredas/districts (1,359 woredas) linked to parent zones",
        "geography",
        is_hierarchical=True,
        attribute_schema={
            "type": "object",
            "properties": {
                "unit_id": {"type": "string", "description": "System unit identifier"},
                "pcode": {"type": "string", "description": "National P-code"},
                "parent_zone_pcode": {"type": "string", "description": "Parent zone P-code"}
            }
        }
    )
    cur.execute("""
        INSERT INTO g2p_list_version_values (list_id, version_no, value_id, value_code, display, parent_value_code, sort_order, attributes, status)
        SELECT 
            'ADMIN_WOREDAS_CATALOG',
            1,
            w.unit_id,
            REPLACE(w.unit_id, 'woreda-', ''),
            w.name,
            REPLACE(w.parent_unit_id, 'zone-', ''),
            row_number() OVER (ORDER BY w.name),
            jsonb_build_object(
                'unit_id', w.unit_id,
                'pcode', REPLACE(w.unit_id, 'woreda-', ''),
                'parent_zone_pcode', REPLACE(w.parent_unit_id, 'zone-', ''),
                'parent_zone_name', COALESCE(z.name, '')
            ),
            'ACTIVE'
        FROM g2p_geo_version_units w
        LEFT JOIN g2p_geo_version_units z ON w.parent_unit_id = z.unit_id AND z.version_no = 1
        WHERE w.level_id = 'level-woreda' AND w.version_no = 1
        ORDER BY w.name;
    """)

    cur.execute("ALTER TABLE g2p_list_versions ENABLE TRIGGER trg_g2p_list_versions_guard;")
    cur.execute("ALTER TABLE g2p_list_version_values ENABLE TRIGGER trg_g2p_list_version_values_guard;")

    conn.commit()
    cur.close()
    conn.close()
    print("Geography catalogs imported into All Catalogs successfully!")

if __name__ == '__main__':
    run()
