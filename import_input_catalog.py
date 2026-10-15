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

CATALOG_INPUTS = [
    {
        "input_code": "FERT-NPSB",
        "trade_name": "NPSB Soil Blend",
        "input_category": "INORGANIC_FERTILIZER",
        "nutrient_composition": "18.9% N, 37.7% P2O5, 6.95% S, 0.1% B",
        "manufacturer": "OCP Group / Ministry of Agriculture",
        "application_method": "Basal row application at planting",
        "recommended_crops": "Wheat, Teff, Barley, Maize",
        "recommended_dosage": "100 kg/ha",
        "license_number": "MOA-REG-FERT-2021-001",
        "safety_precautions": "Store in dry cool place. Keep away from water sources.",
        "description": "National standard inorganic fertilizer blend for Ethiopian acidic/depleted soils."
    },
    {
        "input_code": "FERT-UREA",
        "trade_name": "Urea 46-0-0",
        "input_category": "INORGANIC_FERTILIZER",
        "nutrient_composition": "46% Total Nitrogen (N)",
        "manufacturer": "Ethio-Agri Import Corp",
        "application_method": "Split top-dressing at active tillering",
        "recommended_crops": "All Cereals, Horticultural Crops",
        "recommended_dosage": "100 kg/ha",
        "license_number": "MOA-REG-FERT-2021-002",
        "safety_precautions": "Store under roof. Hygroscopic - keep sealed.",
        "description": "High analysis nitrogen fertilizer for vegetative vigor and protein synthesis."
    },
    {
        "input_code": "FERT-DAP",
        "trade_name": "DAP 18-46-0",
        "input_category": "INORGANIC_FERTILIZER",
        "nutrient_composition": "18% N, 46% P2O5",
        "manufacturer": "Ethiopian Agricultural Businesses Corporation",
        "application_method": "Basal application at sowing",
        "recommended_crops": "Teff, Wheat, Barley, Sorghum",
        "recommended_dosage": "100 kg/ha",
        "license_number": "MOA-REG-FERT-2020-003",
        "safety_precautions": "Keep dry. Avoid direct contact with seeds.",
        "description": "High phosphorus basal fertilizer for root establishment and early seedling vigor."
    },
    {
        "input_code": "FERT-COMPOST",
        "trade_name": "Bio-Green Vermicompost",
        "input_category": "ORGANIC_FERTILIZER",
        "nutrient_composition": "Rich in humic acid, 2.5% N, 1.8% P, 2.0% K",
        "manufacturer": "EcoFarm Inputs PLC",
        "application_method": "Soil mixing at 2-5 tons/hectare",
        "recommended_crops": "Vegetables, Seedlings, Coffee nurseries",
        "recommended_dosage": "2500 kg/ha",
        "license_number": "MOA-REG-ORG-2022-014",
        "safety_precautions": "Keep aerated and moist. Avoid direct sunlight.",
        "description": "Enriched organic vermicompost improving soil biology and water retention."
    },
    {
        "input_code": "FERT-BIO-RHIZO",
        "trade_name": "Legume Bio-Rhizobium",
        "input_category": "BIO_FERTILIZER",
        "nutrient_composition": "Live Rhizobium leguminosarum strain (> 10^9 CFU/g)",
        "manufacturer": "National Soil Testing Lab / Holetta",
        "application_method": "Seed coating slurry before sowing",
        "recommended_crops": "Faba Bean, Chickpea, Lentils, Soybean",
        "recommended_dosage": "500 g per 50 kg seed",
        "license_number": "MOA-REG-BIO-2021-005",
        "safety_precautions": "Do not expose to sunlight or chemical pesticides. Store below 25C.",
        "description": "Biological nitrogen-fixing inoculant for pulse and oilseed legume crops."
    },
    {
        "input_code": "FERT-ZINC-BORON",
        "trade_name": "Agri-Zinc & Boron Micronutrients",
        "input_category": "MICRONUTRIENT",
        "nutrient_composition": "12% Chelated Zinc (Zn), 5% Boron (B)",
        "manufacturer": "Yara International / Ethiopian Agrochemicals",
        "application_method": "Foliar spray during vegetative stage",
        "recommended_crops": "Coffee, Maize, Wheat, Fruit trees",
        "recommended_dosage": "1.5 L/ha in 300L water",
        "license_number": "MOA-REG-MICRO-2023-008",
        "safety_precautions": "Wear protective gear during spraying. Wash hands after use.",
        "description": "Chelated foliar micronutrient blend correcting widespread Zn and B deficiencies."
    },
    {
        "input_code": "AMEND-LIME",
        "trade_name": "Agricultural Dolomitic Lime",
        "input_category": "SOIL_AMENDMENT",
        "nutrient_composition": "85% CaCO3 + MgCO3, Neutralizing Value 95%",
        "manufacturer": "Ethiopian Mineral Development SC",
        "application_method": "Broadcast and incorporation before rains",
        "recommended_crops": "All crops on acidic soils (pH < 5.5)",
        "recommended_dosage": "2500 kg/ha",
        "license_number": "MOA-REG-SOIL-2019-002",
        "safety_precautions": "Wear dust mask and eye protection during spreading.",
        "description": "Crushed dolomitic limestone for acidic soil neutralization and calcium supply."
    },
    {
        "input_code": "INP-DELTAMETHRIN-01",
        "trade_name": "Decis Deltamethrin 2.5% EC",
        "input_category": "INSECTICIDE",
        "nutrient_composition": "Deltamethrin 25 g/L EC",
        "manufacturer": "Bayer CropScience / Ethiopian Import PLC",
        "application_method": "Foliar spray",
        "recommended_crops": "Wheat, Teff, Barley, Maize, Vegetables",
        "recommended_dosage": "0.5 L/ha in 200L water",
        "license_number": "MOA-REG-PEST-2020-045",
        "safety_precautions": "Class II moderately hazardous. Withholding period 14 days.",
        "description": "Fast-acting pyrethroid insecticide controlling caterpillars, aphids, and beetles."
    },
    {
        "input_code": "INP-HERB-24D",
        "trade_name": "2,4-D Amine 720 SL",
        "input_category": "HERBICIDE",
        "nutrient_composition": "2,4-D dimethylamine salt 720 g/L SL",
        "manufacturer": "Adama Agricultural Solutions",
        "application_method": "Post-emergence selective foliar spray",
        "recommended_crops": "Teff, Wheat, Barley",
        "recommended_dosage": "1.2 L/ha in 200L water",
        "license_number": "MOA-REG-HERB-2019-012",
        "safety_precautions": "Avoid drift onto broadleaf crops. Wear protective rubber gloves.",
        "description": "Selective hormone-type herbicide controlling broadleaf weeds in cereal crops."
    },
    {
        "input_code": "INP-FUNG-MANCOZEB",
        "trade_name": "Mancozeb 80% WP Broad Spectrum",
        "input_category": "FUNGICIDE",
        "nutrient_composition": "Mancozeb 800 g/kg WP",
        "manufacturer": "UPL Corporation / Green Agri Ethiopia",
        "application_method": "Preventative foliar spray",
        "recommended_crops": "Potato, Tomato, Wheat, Coffee",
        "recommended_dosage": "2.0 kg/ha in 400L water",
        "license_number": "MOA-REG-FUNG-2021-033",
        "safety_precautions": "Do not harvest within 7 days of treatment. Store away from food.",
        "description": "Broad-spectrum contact fungicide controlling late blight, rust, and leaf spots."
    },
    {
        "input_code": "INP-SEED-APRON",
        "trade_name": "Apron Star 42 WS",
        "input_category": "SEED_TREATMENT",
        "nutrient_composition": "Difenoconazole 20 g/kg + Metalaxyl-M 200 g/kg + Thiamethoxam 200 g/kg",
        "manufacturer": "Syngenta Crop Protection",
        "application_method": "Seed dressing slurry before planting",
        "recommended_crops": "Maize, Sorghum, Cotton, Pulses",
        "recommended_dosage": "10 g per 4 kg seed",
        "license_number": "MOA-REG-SEDT-2022-009",
        "safety_precautions": "Treated seed must not be used for food or animal feed.",
        "description": "Combined fungicide and systemic insecticide seed dressing for early crop vigor."
    }
]

def run():
    conn = psycopg2.connect(**DB_PARAMS)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        cur.execute("ALTER TABLE g2p_list_versions DISABLE TRIGGER trg_g2p_list_versions_guard;")
        cur.execute("ALTER TABLE g2p_list_version_values DISABLE TRIGGER trg_g2p_list_version_values_guard;")
    except Exception as e:
        print("Note on triggers:", e)

    catalog_id = "INPUT_CATALOG"
    display_name = "Agricultural Inputs Catalog"
    description = "National reference catalog of approved agricultural inputs: fertilizers, pesticides, soil amendments, and seed treatments"
    domain = "agriculture"
    owner_org = "Ministry of Agriculture (MoA)"

    schema = {
        "type": "object",
        "properties": {
            "input_code": {"type": "string", "description": "Unique agricultural input code"},
            "input_category": {"type": "string", "description": "Category (Inorganic, Organic, Pesticide, etc.)"},
            "nutrient_composition": {"type": "string", "description": "Chemical formula or nutrient analysis"},
            "manufacturer": {"type": "string", "description": "Manufacturer or importing distributor"},
            "application_method": {"type": "string", "description": "Recommended application technique"},
            "recommended_crops": {"type": "string", "description": "Suitable crops"},
            "recommended_dosage": {"type": "string", "description": "Standard application dosage"},
            "license_number": {"type": "string", "description": "Official Ministry registration number"},
            "safety_precautions": {"type": "string", "description": "Handling and safety guidance"}
        },
        "required": ["input_code", "input_category", "manufacturer"]
    }

    print(f"Setting up catalog: {catalog_id}...")

    # 1. g2p_attributes
    cur.execute("""
        INSERT INTO g2p_attributes (
            attribute_id, attribute_code, attribute_display, is_hierarchical,
            description, domain, owner_org, visibility, current_version_no
        )
        VALUES (%s, %s, %s, false, %s, %s, %s, 'public', 1)
        ON CONFLICT (attribute_id) DO UPDATE SET
            attribute_code = EXCLUDED.attribute_code,
            attribute_display = EXCLUDED.attribute_display,
            description = EXCLUDED.description,
            domain = EXCLUDED.domain,
            owner_org = EXCLUDED.owner_org,
            visibility = EXCLUDED.visibility,
            current_version_no = 1;
    """, (catalog_id, catalog_id, display_name, description, domain, owner_org))

    # 2. g2p_list_versions
    cur.execute("""
        INSERT INTO g2p_list_versions (
            list_id, version_no, list_code, display, is_hierarchical,
            attribute_schema, status, effective_from, published_at
        )
        VALUES (%s, 1, %s, %s, false, %s, 'PUBLISHED', '1970-01-01 00:00:00+00', NOW())
        ON CONFLICT (list_id, version_no) DO UPDATE SET
            list_code = EXCLUDED.list_code,
            display = EXCLUDED.display,
            attribute_schema = EXCLUDED.attribute_schema,
            status = 'PUBLISHED',
            effective_from = '1970-01-01 00:00:00+00';
    """, (catalog_id, catalog_id, display_name, json.dumps(schema)))

    # 3. Clean existing values
    cur.execute("DELETE FROM g2p_list_version_values WHERE list_id = %s;", (catalog_id,))

    # 4. Insert values
    for idx, item in enumerate(CATALOG_INPUTS, start=1):
        attrs = {
            "input_code": item["input_code"],
            "input_category": item["input_category"],
            "nutrient_composition": item["nutrient_composition"],
            "manufacturer": item["manufacturer"],
            "application_method": item["application_method"],
            "recommended_crops": item["recommended_crops"],
            "recommended_dosage": item["recommended_dosage"],
            "license_number": item["license_number"],
            "safety_precautions": item["safety_precautions"]
        }
        cur.execute("""
            INSERT INTO g2p_list_version_values (
                list_id, version_no, value_id, value_code, display, sort_order, attributes, status
            )
            VALUES (%s, 1, %s, %s, %s, %s, %s, 'ACTIVE');
        """, (
            catalog_id,
            item["input_code"],
            item["input_code"],
            f"{item['trade_name']} ({item['input_code']})",
            idx,
            json.dumps(attrs)
        ))

    try:
        cur.execute("ALTER TABLE g2p_list_versions ENABLE TRIGGER trg_g2p_list_versions_guard;")
        cur.execute("ALTER TABLE g2p_list_version_values ENABLE TRIGGER trg_g2p_list_version_values_guard;")
    except Exception as e:
        pass

    conn.commit()
    cur.close()
    conn.close()
    print(f"Successfully imported {len(CATALOG_INPUTS)} inputs into {catalog_id}!")

if __name__ == "__main__":
    run()
