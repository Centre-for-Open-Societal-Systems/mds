# OpenG2P Master Data Service (MDS) Standalone

A complete, production-ready standalone deployment of **OpenG2P Master Data Service (MDS)** featuring:
* **Master Data Core API** (FastAPI / Gunicorn on port `8044`)
* **Master Data Catalogue UI** (Next.js with customized domain navigation on port `3005`)
* **PostgreSQL 16** pre-configured for administrative geography and client reference catalogs
* **MinIO Object Store** (S3 compatible for GeoJSON administrative boundaries)
* **Pre-configured Reference Catalogs**:
  * 🌾 **Crop Domain**: Crop Catalog (129), Crop Categories (7), Crop Varieties (902), Ecological Zones (3)
  * 🐄 **Livestock Domain**: Livestock Species (5), Livestock Breeds (94), Populations (40), Genders (4), Production Types (13), Body Conditions (5), Record Statuses (6)
  * 🌱 **Seed Domain**: Certified Seed Catalog (129), Seed Demand Summary (1), Seed Demand Trend (5), Demand by Crop (18)
  * 📍 **Geography Domain**: Administrative Regions (14), Administrative Zones (125), Administrative Woredas (1,359)

---

## 1. Architecture Overview

### Standalone vs. Full OpenG2P Stack
In the full OpenG2P deployment, MDS depends on an external Identity & Access Management (IAM) suite, Keycloak, Redis sessions, and multiple auxiliary services. In this **Standalone** distribution, MDS is decoupled into a self-sufficient cluster:

```
+---------------------------------------------------------------------------------+
|                                 Next.js Web UI                                  |
|                         (Port 3005 -> Container 3000)                          |
|     - Custom Sidebar: Crops, Livestock, Seeds, Geography, All Catalogs          |
|     - Embedded Mock IAM Service (Port 8020) for standalone administrator access  |
+----------------------------------------+----------------------------------------+
                                         |
                                         v
+---------------------------------------------------------------------------------+
|                                FastAPI Core API                                 |
|                         (Port 8044 -> Container 8000)                          |
|     - Master Data Engine, Draft Versions, Maker-Checker Workflows, DCAT, Geo    |
|     - Autonomous Standalone Auth Middleware (Full Permissions Admin Mode)      |
+-----------------------------------+---------------------------------------------+
                                    |
                    +---------------+---------------+
                    |                               |
                    v                               v
+---------------------------------------+   +-------------------------------------+
|        PostgreSQL 16 Database         |   |          MinIO Object Store         |
|     (Port 5434 -> Container 5432)     |   |    (API: 9010 / Console: 9011)      |
|     - Schema: master_data             |   |    - Bucket: openg2p-geo            |
|     - Tables: catalogs, versions, geo |   |    - GeoJSON boundary feature sets  |
+---------------------------------------+   +-------------------------------------+
```

---

## 2. Master Data Workflow & Governance

MDS implements strict **Maker-Checker (Four-Eyes Principle)** governance to ensure data integrity across all consuming registries:

```
[ Active Version v1 ] (Serving Live Consumers)
         │
         ▼
[ Create Draft v2 ] ──► (Maker: Edits, Adds, Retires entries in isolation)
         │
         ▼
[ Submit for Approval ]
         │
         ▼
[ Review & Diff ] ──► (Checker: Side-by-side comparison of changes)
         │
    ┌────┴────────────┐
    ▼                 ▼
[ Approved ]     [ Rejected ] ──► Returns to Draft
    │
    ▼
[ Published & Immutable ] ──► Version v2 is locked with timestamp and takes effect
```

1. **Active Published Version (`v1`)**: External services and staff portals query immutable published versions.
2. **Drafting (Maker)**: Any editor can create a new draft (e.g., `v2`). Modifications do not impact live consumers.
3. **Submission**: Once revisions are complete, the maker submits the draft for review.
4. **Approval (Checker)**: A separate user with publish permissions inspects changes using the side-by-side **Compare versions** tool and approves or rejects the draft.
5. **Publishing**: The version is assigned an effective date and locked permanently.

---

## 3. Quick Start

### Prerequisites
* Docker Engine 24.0+
* Docker Compose v2.20+

### Starting Services
Run from the root of this repository:
```bash
docker compose up -d
```

### Checking Status
```bash
docker compose ps
```
All containers (`mds-standalone-api`, `mds-standalone-ui`, `mds-standalone-postgres`, `mds-standalone-minio`) should report `Up` and `healthy`.

### Service Endpoints
| Component | Endpoint | Credentials / Purpose |
|---|---|---|
| **Web Portal (UI)** | [http://localhost:3005](http://localhost:3005) | Main Catalogue UI (Authenticates via Keycloak) |
| **Keycloak IAM** | [http://localhost:8080](http://localhost:8080) | Realm: `staff`, Client: `farmer-registry-staff-portal` |
| **Staff IAM API** | [http://localhost:8020](http://localhost:8020) | User permissions & session management |
| **Master Data API** | [http://localhost:8044](http://localhost:8044) | Core REST API (Secured via Keycloak JWTs) |
| **API Swagger Docs** | [http://localhost:8044/docs](http://localhost:8044/docs) | Interactive OpenAPI documentation |
| **MinIO Console** | [http://localhost:9011](http://localhost:9011) | User: `minioadmin` / Pass: `minioadmin` |
| **MinIO S3 API** | [http://localhost:9010](http://localhost:9010) | GeoJSON boundary storage endpoint |
| **PostgreSQL** | `localhost:5434` | DB: `master_data`, User: `postgres`, Pass: `password` |

### Default Multi-User Accounts
When accessing [http://localhost:3005](http://localhost:3005), you are redirected to the Keycloak login screen. You can log in as any of the following users:

| Username | Password | Full Name | Assigned Roles & Capabilities |
|---|---|---|---|
| `alex.carter` | `alex` | Alex Carter | **Technical Administrator** (Full Maker/Checker, Create, Edit, View, Delete) |
| `nina.patel` | `nina` | Nina Patel | **Technical Administrator** (Full Maker/Checker, Create, Edit, View, Delete) |
| `staff` | `staff` | Local Developer | **Reference Data Specialist & Tech Admin** (Full Maker/Checker, Create, Edit, Publish) |

To switch users: click **"Sign out"** in the top-right profile menu. The session is immediately invalidated on the IAM service, allowing you to sign in as a different user.

### Stopping Services
```bash
docker compose down
```

---

## 4. Real IAM & Keycloak Architecture

MDS connects directly to the OpenG2P Keycloak and Staff IAM services:
* **Real Multi-User Authentication**: No hardcoded mock credentials or simulated sessions. Every user logs in with their own Keycloak identity.
* **Granular Role-Based Permissions**: When a user logs in, MDS UI requests `/user-access/get_application_permissions_for_user` from IAM for `farmer-registry-staff-portal`. Roles such as `Reference Data Specialist` and `Technical Administrator` grant `referenceData:create`, `referenceData:edit`, `referenceData:view`, and `referenceData:delete`, activating the "+ Add entry" button and draft editing controls.
* **Standard Token Validation**: Every request from the UI to `master-data-api` transmits the real Keycloak Bearer JWT. `master-data-api` validates token signatures against Keycloak JWKS and enforces required permissions.
* **Clean Signout**: Clicking "Sign out" redirects to `/auth/logout` on the IAM service, terminating the session and clearing all cookies across tabs.
* **Transparent Container Network Bridges (`docker_proxy.py` & `docker_proxy.js`)**: Pure TCP forwarding bridges (zero business logic) forward container-local calls on port `8020` (IAM) and `8080` (Keycloak) to the host. In production with standard domain names (e.g., `https://iam.example.org`), the forwarders are replaced simply by setting `IAM_URL=https://iam.example.org`.

---

## 5. Catalog Data Import Scripts

To populate or re-seed reference catalogs into PostgreSQL:

### Import All Core Catalogs (Crops, Livestock, Seeds)
```bash
docker cp import_all_catalogs.py mds-standalone-api:/tmp/import_all_catalogs.py
docker exec mds-standalone-api python /tmp/import_all_catalogs.py
```

### Import Administrative Geography Catalogs (Regions, Zones, Woredas)
```bash
docker cp add_geography_to_catalogs.py mds-standalone-api:/tmp/add_geography_to_catalogs.py
docker exec mds-standalone-api python /tmp/add_geography_to_catalogs.py
```

---

## 6. DevOps Deployment & Infrastructure Guide

This section is prepared for DevOps and Platform Engineers deploying MDS to cloud environments (Kubernetes, AWS ECS, Docker Swarm, or dedicated VMs).

### 6.1 Network & Port Requirements
Ensure the following ports are open or mapped in your ingress/reverse proxy:

| Internal Port | External/Host Port | Service | Protocol | Exposure |
|---|---|---|---|---|
| `3000` | `3005` | `mds-standalone-ui` | HTTP | Public / Ingress |
| `8000` | `8044` | `mds-standalone-api` | HTTP | Internal or Public via Ingress |
| `5432` | `5434` | `mds-standalone-postgres` | TCP | Private / Internal VPC only |
| `9000` | `9010` | `mds-standalone-minio` | HTTP | Private (API access for boundaries) |
| `9001` | `9011` | `mds-standalone-minio` | HTTP | Admin Only / VPN |

### 6.2 Environment Variables Reference (`.env`)
Create a `.env` file for environment-specific overrides:

```dotenv
# --- PostgreSQL Settings ---
POSTGRES_USER=postgres
POSTGRES_PASSWORD=secure_production_password
POSTGRES_DB=master_data
POSTGRES_PORT=5434

# --- MinIO Object Store Settings ---
MINIO_ROOT_USER=minioadmin
MINIO_ROOT_PASSWORD=secure_minio_password
MINIO_API_PORT=9010
MINIO_CONSOLE_PORT=9011

# --- Master Data Core API Settings ---
MASTER_DATA_API_PORT=8044
MASTER_DATA_API_AUTH_ENABLED=true
MASTER_DATA_API_CSRF_ENABLED=false
MASTER_DATA_API_PUBLIC_CATALOGUE_ENABLED=true
MASTER_DATA_API_CATALOGUE_APPROVAL_MODE=permission
MASTER_DATA_API_CATALOGUE_COUNTRY=ETH

# --- Master Data UI Settings ---
MASTER_DATA_UI_PORT=3005
COOKIE_DOMAIN=localhost
LOGIN_PROVIDER_ID=1
APPLICATION_MNEMONIC=farmer-registry-staff-portal
```

### 6.3 Deployment Modes: Corporate Keycloak / IAM Integration (Active)

The deployment is configured for direct integration with OpenG2P Keycloak and IAM:

1. **Master Data UI (`master-data-ui`)**:
   * `LOGIN_PROVIDER_ID="1"`: Directs unauthenticated users to the Keycloak OIDC login transaction.
   * `IAM_URL="http://localhost:8020"`: Points to the IAM service (on server/cloud, set to your IAM ingress URL, e.g. `https://iam.example.org`).
   * `APPLICATION_MNEMONIC="farmer-registry-staff-portal"`: Identifies the client application for role-to-permission mapping.
   * `COOKIE_DOMAIN="localhost"`: Set to your deployment root domain (e.g., `.example.org`).

2. **Master Data API (`master-data-api`)**:
   * `MASTER_DATA_API_AUTH_ENABLED="true"`: Requires valid Keycloak JWT bearer tokens for write and administrative endpoints.
   * `MASTER_DATA_API_AUTH_PROVIDER_API_URL="http://localhost:8020"`: IAM endpoint for evaluating role permissions and data policies.
   * `MASTER_DATA_API_KEYCLOAK_CLIENT_ID="farmer-registry-staff-portal"`: Client mnemonic holding user roles.
   * `MASTER_DATA_API_AUTH_REDIS_URL="redis://host.docker.internal:6387/0"`: Shared Redis instance where IAM session tokens reside.

### 6.4 Persistent Storage & Volumes
For production deployments, ensure persistent volume claims (PVCs) or host mounts are backed by resilient storage:
* **PostgreSQL Volume**: `mds_pgdata` &rarr; `/var/lib/postgresql/data`
* **MinIO Volume**: `mds_miniodata` &rarr; `/data`

### 6.5 Health Checks & Probes
Configure your orchestrator (Kubernetes / Docker Compose) with these probes:

* **Master Data Core API**:
  * Type: HTTP GET
  * Path: `http://<api-host>:8000/ping`
  * Expected Status: `200 OK`
* **Master Data UI**:
  * Type: HTTP GET
  * Path: `http://<ui-host>:3000/en`
  * Expected Status: `200 OK`
* **PostgreSQL**:
  * Command: `pg_isready -U postgres -d master_data`

### 6.6 Backup & Disaster Recovery Procedures

#### 1. PostgreSQL Database Backup
Run a snapshot dump of all catalog definitions, versions, and values:
```bash
docker exec -t mds-standalone-postgres pg_dump -U postgres -d master_data -F c -b -v -f /tmp/mds_backup_$(date +%Y%m%d).dump
docker cp mds-standalone-postgres:/tmp/mds_backup_$(date +%Y%m%d).dump ./
```

To restore:
```bash
docker cp ./mds_backup_YYYYMMDD.dump mds-standalone-postgres:/tmp/
docker exec -t mds-standalone-postgres pg_restore -U postgres -d master_data -c -v /tmp/mds_backup_YYYYMMDD.dump
```

#### 2. MinIO S3 Boundary Data Backup
Mirror the GeoJSON boundary bucket to local storage or an external S3 bucket:
```bash
docker run --rm --network master-data-standalone_mds_net -v $(pwd)/backup_geo:/backup minio/mc \
  mirror local/openg2p-geo /backup/openg2p-geo
```

### 6.7 DevOps Deployment Checklist
- [ ] Docker & Docker Compose installed on host VM.
- [ ] Ports `3005` (UI) and `8044` (API) routed through reverse proxy / Ingress with SSL/TLS termination.
- [ ] Environment file `.env` configured with production passwords.
- [ ] Persistent storage volumes assigned to PostgreSQL and MinIO.
- [ ] Daily cron job configured for PostgreSQL `pg_dump` snapshot.
- [ ] Healthcheck probe configured to monitor `/ping` on port `8044`.

---

## 7. License
Open Source under Apache 2.0 / MIT.
