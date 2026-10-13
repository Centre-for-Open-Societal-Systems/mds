# OpenG2P Master Data Service (MDS) Standalone

A complete, production-ready standalone deployment of **OpenG2P Master Data Service (MDS)** featuring:
* **Master Data Core API** (FastAPI / Gunicorn on port `8044`)
* **Master Data Catalogue UI** (Next.js with custom domain navigation on port `3005`)
* **PostgreSQL 16** with pre-seeded administrative geography and client reference catalogs
* **MinIO Object Store** (S3 compatible for GeoJSON boundary polygons)
* **Pre-configured Reference Catalogs**:
  * 🌾 **Crop Domain**: Crop Catalog (129), Crop Categories (7), Crop Varieties (902), Ecological Zones (3)
  * 🐄 **Livestock Domain**: Livestock Species (5), Livestock Breeds (94), Populations (40), Genders (4), Production Types (13), Body Conditions (5), Record Statuses (6)
  * 🌱 **Seed Domain**: Certified Seed Catalog (129), Seed Demand Summary (1), Seed Demand Trend (5), Demand by Crop (18)
  * 📍 **Geography Domain**: Administrative Regions (14), Administrative Zones (125), Administrative Woredas (1,359)

---

## Architecture Overview

```
+-----------------------------------------------------------+
|               Next.js Web UI (Port 3005)                  |
|    - Crops, Livestock, Seeds, Geography, All Catalogs     |
+-----------------------------+-----------------------------+
                              |
                              v
+-----------------------------------------------------------+
|               FastAPI MDS API (Port 8044)                 |
|       - Public & Protected Catalogues, Drafts, Geo        |
+-------------------+-------------------+-------------------+
                    |                   |
                    v                   v
+-----------------------+   +-------------------------------+
| PostgreSQL (Port 5434)|   | MinIO S3 Storage (Port 9010)  |
| - master_data DB      |   | - openg2p-geo bucket          |
+-----------------------+   +-------------------------------+
```

---

## Quick Start

### 1. Prerequisites
* Docker Engine 24+ & Docker Compose v2+
* Python 3.10+ (optional, for local import scripts)

### 2. Start Services
```bash
docker compose up -d
```

Verify containers are running and healthy:
```bash
docker compose ps
```

### 3. Service Endpoints
* **Web Portal (UI)**: [http://localhost:3005](http://localhost:3005)
* **Master Data API**: [http://localhost:8044](http://localhost:8044)
* **API Swagger Docs**: [http://localhost:8044/docs](http://localhost:8044/docs)
* **MinIO Console**: [http://localhost:9011](http://localhost:9011) (`minioadmin` / `minioadmin`)

---

## Catalog Import & Data Sync Scripts

The repository includes automation scripts to populate and synchronize catalogs:

### Import All Core Catalogs
```bash
docker cp import_all_catalogs.py mds-standalone-api:/tmp/import_all_catalogs.py
docker exec mds-standalone-api python /tmp/import_all_catalogs.py
```

### Import Administrative Geography Catalogs
```bash
docker cp add_geography_to_catalogs.py mds-standalone-api:/tmp/add_geography_to_catalogs.py
docker exec mds-standalone-api python /tmp/add_geography_to_catalogs.py
```

### Custom Sidebar Navigation & Standalone Mode
The standalone auth bypass (`patch_ui.js`, `patch_api.py`, `mock_iam.js`) and customized sidebar navigation (`customize_sidebar.js`, `reorder_sidebar.js`) are mounted automatically into the containers and applied on every container start. No manual copying or container restarting is required.

---

## Governance & Approval Workflow

MDS enforces strict **Maker-Checker (Four-Eyes Principle)** governance:
1. **Drafting (Maker)**: Any user can open a draft version (`v2`) and add/edit/retire entries without impacting live consumers.
2. **Submission**: Click **Submit for approval**.
3. **Approval (Checker)**: Another user with publish permissions logs in, inspects side-by-side differences in **Compare versions**, and clicks **Approve**.
4. **Publishing**: The version becomes immutable, timestamped, and immediately effective for external consumers.

---

## License
Open Source under Apache 2.0 / MIT.
