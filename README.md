# OpenG2P Master Data Service (MDS) — Custom Extension

This repository contains the **Master Data Service (MDS) Custom Extension** for OpenG2P. It is built as a non-invasive extension overlay on top of the upstream [OpenG2P Master Data Service](https://github.com/OpenG2P/master-data-service), enabling custom business entities, classification hierarchies, certification statuses, and specialized UI workflows without modifying upstream core code.

---

## Architecture & Customization Highlights

- **UI Component Overlay (`ui/overrides/`)**: Custom Next.js components replace default upstream views at build time via `docker/ui.Dockerfile`.
- **Catalog vs. Lookup Differentiation (`sitecustomize.py`)**: Adds `table_type` support (`catalog` vs `lookup`) directly to `master-data-api` via runtime Python hooks.
- **Certification Lifecycle**: Adds `certification_status` (`Certified` / `Uncertified`) across all 13 Master Catalogs. Existing baseline data defaults to `Certified`; new entries default to `Uncertified`.
- **Clean Navigation**:
  - Dedicated views for **All Catalogs** (13) and **All Lookups** (10).
  - Breadcrumb back-navigation preserving active filters (`/datasets?type=catalog` vs `/datasets?type=lookup`).
  - Top-only pagination controls (bottom pagination removed).
  - Expanded entry drawer with bottom-only **Edit catalog** modal trigger.
  - Dynamically wrapped schema columns with text clamping.

---

## Summary of Catalogs & Lookups (23 Total)

| # | Dataset Code | Display Title | Type | Status |
|---|---|---|---|---|
| 01 | `CROP_CATALOG` | Crop Catalog | **Catalog** | Certified |
| 02 | `CROP_CATEGORY_CATALOG` | Crop Category Catalog | **Catalog** | Certified |
| 03 | `CROP_VARIETY_CATALOG` | Crop Variety Catalog | **Catalog** | Certified |
| 04 | `ECOLOGICAL_ZONE_CATALOG` | Ecological Zone Catalog | **Catalog** | Certified |
| 05 | `INPUT_CATALOG` | Agricultural Inputs Catalog | **Catalog** | Certified |
| 06 | `SEED_CATALOG` | Seed Catalog | **Catalog** | Certified |
| 07 | `SEED_DEMAND_SUMMARY_CATALOG` | Seed Demand Summary Catalog | **Catalog** | Certified |
| 08 | `SEED_DEMAND_TREND_CATALOG` | Seed Demand Trend Catalog | **Catalog** | Certified |
| 09 | `SEED_DEMAND_BY_CROP_CATALOG` | Seed Demand by Crop Catalog | **Catalog** | Certified |
| 10 | `LIVESTOCK_CATALOG` | Livestock Catalog | **Catalog** | Certified |
| 11 | `LIVESTOCK_BREED_CATALOG` | Livestock Breed Catalog | **Catalog** | Certified |
| 12 | `LIVESTOCK_POPULATION_CATALOG` | Livestock Population Catalog | **Catalog** | Certified |
| 13 | `LIVESTOCK_REGISTRY_ENTRY_CATALOG` | Livestock Registry Entry Catalog | **Catalog** | Certified |
| 14 | `ADMIN_COUNTRIES_CATALOG` | Countries Catalog (ETH) | **Lookup** | Standard |
| 15 | `ADMIN_REGIONS_CATALOG` | Administrative Regions Catalog | **Lookup** | Standard |
| 16 | `ADMIN_ZONES_CATALOG` | Administrative Zones Catalog | **Lookup** | Standard |
| 17 | `ADMIN_WOREDAS_CATALOG` | Administrative Woredas Catalog | **Lookup** | Standard |
| 18 | `ADMIN_KEBELES_CATALOG` | Administrative Kebeles Catalog | **Lookup** | Standard |
| 19 | `LIVESTOCK_BODY_CONDITION_CATALOG` | Livestock Body Condition Catalog | **Lookup** | Standard |
| 20 | `LIVESTOCK_GENDER_CATALOG` | Livestock Gender Catalog | **Lookup** | Standard |
| 21 | `LIVESTOCK_LOCATION_TYPE_CATALOG` | Livestock Location Type Catalog | **Lookup** | Standard |
| 22 | `LIVESTOCK_PRODUCTION_TYPE_CATALOG` | Livestock Production Type Catalog | **Lookup** | Standard |
| 23 | `LIVESTOCK_RECORD_STATUS_CATALOG` | Livestock Record Status Catalog | **Lookup** | Standard |

---

## Quick Start: Local Development Setup

Follow these steps to run the complete MDS extension on a local workstation.

### 1. Prerequisites
- **Git**
- **Docker Engine** 24.0+ & **Docker Compose** v2.20+
- **Python 3.10+** (optional, for running migration scripts outside containers)

### 2. Clone the Repository
```bash
git clone <YOUR_REPOSITORY_URL> coss-mds
cd coss-mds
```

### 3. Environment Configuration
Copy the template `.env.example` file to `.env`:
```bash
cp .env.example .env
```
*(Default values in `.env.example` are pre-configured for immediate local execution).*

### 4. Build and Start the Containers
Run Docker Compose to build the custom UI overlay and launch all services:
```bash
docker compose up -d --build
```
This starts:
- **`coss-mds-ui`** on port `3005` (Next.js with custom overlay)
- **`coss-mds-api`** on port `8044` (FastAPI with `sitecustomize.py` hook)
- **`coss-postgres`** on port `5434` (Database `master_data`)
- **`coss-redis`** on port `6387` (Session cache)
- **`coss-minio`** on port `9010` / `9011` (Boundary S3 store)

Verify containers are running:
```bash
docker compose ps
```

### 5. Seed Database & Synchronize Catalogs
Populate all 23 client catalogs, schemas, and certification badges into PostgreSQL:

```bash
# Execute synchronization inside the API container:
docker exec -i coss-mds-api python3 < sync_client_catalogs.py
```
*(Alternatively, run locally with `python3 sync_client_catalogs.py` if python3 and psycopg2 are installed on your host).*

### 6. Access the Application
Open your browser:
- **Catalogs Explorer**: [http://localhost:3005/en/datasets](http://localhost:3005/en/datasets)
- **API Swagger Documentation**: [http://localhost:8044/docs](http://localhost:8044/docs)
- **MinIO Console**: [http://localhost:9011](http://localhost:9011) (`minioadmin` / `minioadmin`)

---

## Production Server Deployment Guide

Follow these steps when deploying the MDS extension to a production or staging Linux server (Ubuntu/Debian, RedHat, etc.).

### 1. Server Prerequisites
- Clean Linux Server (Ubuntu 22.04 LTS or newer recommended)
- Minimum 4 GB RAM, 2 CPU cores, 20 GB SSD
- Ports allowed in firewall / security groups:
  - `80` / `443` (Public Ingress for Web & API)
  - `22` (SSH management)
  - Database ports (`5434`, `9010`) should remain private / blocked from external traffic.

Install Docker and Compose on the server if not present:
```bash
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and log back in for group changes to take effect
```

### 2. Clone Repository onto the Server
```bash
git clone <YOUR_REPOSITORY_URL> /opt/coss-mds
cd /opt/coss-mds
```

### 3. Production Environment Configuration (`.env`)
Create a production `.env` file with secure secrets and your server's domain names:

```ini
# --- PostgreSQL Settings ---
POSTGRES_USER=coss_admin
POSTGRES_PASSWORD=GENERATE_STRONG_SECRET_PASSWORD_HERE
POSTGRES_DB=master_data
POSTGRES_PORT=5434

# --- Master Data Core API Settings ---
MASTER_DATA_API_PORT=8044
MASTER_DATA_API_AUTH_ENABLED=true
MASTER_DATA_API_DB_USER=coss_admin
MASTER_DATA_API_DB_PASSWORD=GENERATE_STRONG_SECRET_PASSWORD_HERE
MASTER_DATA_API_DB_HOST=coss-postgres
MASTER_DATA_API_DB_PORT=5432
MASTER_DATA_API_DB_NAME=master_data

# --- Master Data UI Settings ---
MDS_UI_PORT=3005
COOKIE_DOMAIN=yourdomain.com
BACKEND_URL=http://mds-api:8000

# --- MinIO Object Storage ---
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=GENERATE_STRONG_MINIO_SECRET_HERE
MINIO_API_PORT=9010
MINIO_CONSOLE_PORT=9011
```

### 4. Build and Start Services
```bash
docker compose up -d --build
```

### 5. Run Database Migration & Catalog Seeding
Run the synchronization script against the production database:
```bash
docker exec -i coss-mds-api python3 < sync_client_catalogs.py
```

### 6. Reverse Proxy & SSL Configuration (Nginx Example)
In production, place Nginx or Caddy in front of the application to provide HTTPS/SSL termination.

Sample Nginx server block (`/etc/nginx/sites-available/mds.conf`):
```nginx
# Master Data UI
server {
    server_name mds.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:3005;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}

# Master Data API
server {
    server_name mds-api.yourdomain.com;

    location / {
        proxy_pass http://127.0.0.1:8044;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Enable SSL using Let's Encrypt Certbot:
```bash
sudo certbot --nginx -d mds.yourdomain.com -d mds-api.yourdomain.com
```

---

## Extension Structure & Maintenance

### Adding or Modifying UI Components
All customized UI code lives in `ui/overrides/`:
- **Modifying styles or layouts**: Edit files under `ui/overrides/src/components/`.
- **Modifying catalog tables, views, or modals**: Edit files under `ui/overrides/src/features/attributes/components/`.
- **Rebuilding the UI container after changes**:
  ```bash
  docker compose up -d --build mds-ui
  ```

### Adding New Catalogs or Lookups
To add a new catalog or lookup:
1. Define the SQL file in `data/<domain>/`.
2. Add its schema and metadata to `sync_client_catalogs.py` (specifying `table_type: "catalog"` or `"lookup"`).
3. Re-run `docker exec -i coss-mds-api python3 < sync_client_catalogs.py`.

### Geography Boundaries (MinIO & GeoJSON)
Under **Geography → Boundaries**:
- **Upload GeoJSON** is only shown when viewing an editable **Draft** version. Published versions are immutable.
- **Download** only appears when a level has a GeoJSON object stored in MinIO (bucket `openg2p-geo`, e.g., `geo/ETH/v1/country.geojson`) and registered in `g2p_geo_versions.boundary_objects` / `boundary_checksums`. Levels with `No boundary` do not show a Download button.
- Source GeoJSON files for Ethiopia (`country.geojson`, `region.geojson`, `zone.geojson`, `woreda.geojson`) are located in `../openg2p-data/packs/ETH/boundaries/`. To populate them, either upload each file through the UI in Draft mode and publish, or seed them into MinIO (`http://minio:9000` / `localhost:9010`) and update `g2p_geo_versions`.

---

## Troubleshooting

- **Checking Container Logs**:
  ```bash
  docker logs -f coss-mds-ui
  docker logs -f coss-mds-api
  ```
- **Restarting a Single Service**:
  ```bash
  docker compose restart mds-ui
  ```
- **Resetting Database to Clean State**:
  ```bash
  docker compose down -v
  docker compose up -d
  docker exec -i coss-mds-api python3 < sync_client_catalogs.py
  ```
