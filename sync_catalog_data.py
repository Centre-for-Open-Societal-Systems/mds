import json
import psycopg2

conn = psycopg2.connect(
    dbname="master_data",
    user="postgres",
    password="password",
    host="localhost",
    port=5434
)
cur = conn.cursor()

print("Connected to PostgreSQL")

# 1. Update CROPS with category, ecological zone, field inspection, isolation distance
crop_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "category": {"type": "string", "description": "Crop production category"},
        "ecological_zone": {"type": "string", "description": "Preferred agro-ecological zone"},
        "known_for": {"type": "string", "description": "Distinguishing characteristics or usage"},
        "field_inspections_needed": {"type": "integer", "description": "Number of field inspections required"},
        "isolation_distance_meters": {"type": "integer", "description": "Isolation distance in meters"}
    }
}

cur.execute("""
    UPDATE g2p_list_versions 
    SET attribute_schema = %s 
    WHERE list_id = 'CROPS';
""", (json.dumps(crop_schema),))

# Fetch joined raw_client crops
cur.execute("""
    SELECT 
        cc.id::text,
        cc.name,
        COALESCE(cat.name, '') AS category,
        COALESCE(ez.name, '') AS ecological_zone,
        COALESCE(cc.known_for, '') AS known_for,
        cc.num_field_inspection_needed,
        cc.isolation_distance
    FROM raw_client.crop_catalog cc
    LEFT JOIN raw_client.crop_category cat ON cc.category_id = cat.id
    LEFT JOIN raw_client.ecological_zone ez ON cc.preferred_ecological_zone_id = ez.id;
""")
crops = cur.fetchall()

crop_updated = 0
for cid, name, category, eco_zone, known_for, inspections, isolation in crops:
    attrs = {
        "category": category,
        "ecological_zone": eco_zone,
        "known_for": known_for,
        "field_inspections_needed": inspections,
        "isolation_distance_meters": isolation
    }
    cur.execute("""
        UPDATE g2p_list_version_values
        SET attributes = %s
        WHERE list_id = 'CROPS' AND (value_code = %s OR display ILIKE %s);
    """, (json.dumps(attrs), cid, f"{name[:15]}%"))
    crop_updated += cur.rowcount

print(f"Updated {crop_updated} CROPS entries with connected category & attributes.")

# 2. Update SEED_VARIETIES with crop connection, maintainer, release year, source
seed_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "crop_id": {"type": "integer", "description": "Referenced crop ID in Crop Catalog"},
        "crop_name": {"type": "string", "description": "Crop Name"},
        "category": {"type": "string", "description": "Crop Category"},
        "release_year": {"type": "integer", "description": "Year of release"},
        "maintainer": {"type": "string", "description": "Research center or maintaining institution"},
        "source": {"type": "string", "description": "Domestic or Imported"}
    }
}

cur.execute("""
    UPDATE g2p_list_versions 
    SET attribute_schema = %s 
    WHERE list_id = 'SEED_VARIETIES';
""", (json.dumps(seed_schema),))

cur.execute("""
    SELECT 
        cv.id::text,
        cv.common_name,
        cv.crop_id,
        COALESCE(cc.name, cv.crop_name, '') as crop_name,
        COALESCE(cv.category, '') as category,
        cv.release_year,
        COALESCE(cv.maintainer, '') as maintainer,
        COALESCE(cv.source, '') as source
    FROM raw_client.crop_variety cv
    LEFT JOIN raw_client.crop_catalog cc ON cv.crop_id = cc.id;
""")
varieties = cur.fetchall()

seed_updated = 0
for vid, vname, cid, cname, cat, ryear, maint, src in varieties:
    attrs = {
        "crop_id": cid,
        "crop_name": cname,
        "category": cat,
        "release_year": ryear,
        "maintainer": maint,
        "source": src
    }
    cur.execute("""
        UPDATE g2p_list_version_values
        SET attributes = %s, parent_value_code = %s
        WHERE list_id = 'SEED_VARIETIES' AND (value_code = %s OR display ILIKE %s);
    """, (json.dumps(attrs), str(cid) if cid else None, vid, f"{vname[:15]}%"))
    seed_updated += cur.rowcount

print(f"Updated {seed_updated} SEED_VARIETIES entries with connected crop & attributes.")

# 3. Update LIVESTOCK_BREEDS with connected species, breed_type, abbreviation
livestock_schema = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "type": "object",
    "properties": {
        "species_code": {"type": "string", "description": "Species code in Livestock species catalog"},
        "species_name": {"type": "string", "description": "Species display name"},
        "breed_type": {"type": "string", "description": "Indigenous, Crossbreed, or Exotic"},
        "abbreviation": {"type": "string", "description": "Breed mnemonic abbreviation"},
        "in_national_standard": {"type": "boolean", "description": "Listed in National Livestock Data Standard"}
    }
}

cur.execute("""
    UPDATE g2p_list_versions 
    SET attribute_schema = %s 
    WHERE list_id = 'LIVESTOCK_BREEDS';
""", (json.dumps(livestock_schema),))

cur.execute("""
    SELECT 
        lb.breed_code,
        lb.name,
        lb.species_code,
        COALESCE(lc.name, lb.species_code) as species_name,
        COALESCE(lb.breed_type, '') as breed_type,
        COALESCE(lb.abbreviation, '') as abbreviation,
        lb.in_national_standard
    FROM raw_client.livestock_breed lb
    LEFT JOIN raw_client.livestock_catalog lc ON lb.species_code = lc.species_code;
""")
breeds = cur.fetchall()

breed_updated = 0
for bcode, bname, scode, sname, btype, abbr, std in breeds:
    attrs = {
        "species_code": scode,
        "species_name": sname,
        "breed_type": btype,
        "abbreviation": abbr,
        "in_national_standard": std
    }
    cur.execute("""
        UPDATE g2p_list_version_values
        SET attributes = %s, parent_value_code = %s
        WHERE list_id = 'LIVESTOCK_BREEDS' AND (value_code = %s OR display ILIKE %s);
    """, (json.dumps(attrs), scode, bcode, f"{bname[:15]}%"))
    breed_updated += cur.rowcount

print(f"Updated {breed_updated} LIVESTOCK_BREEDS entries with connected species & attributes.")

conn.commit()
cur.close()
conn.close()
print("All catalog schemas and connections successfully synchronized!")
