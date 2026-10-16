# OpenG2P MDS Standalone on Kubernetes: Runbook

This runbook covers infrastructure provisioning (Terraform), Kubernetes cluster build (k3s + kubectl + helm), and MDS deployment through Ansible. It also covers seeding, verification, day-2 operations, backup and disaster recovery, and troubleshooting.

It moves the `docker compose` stack described in the MDS README onto Kubernetes without dropping any feature.

> In the `mds` repository this lives under `deploy/`: paths below such as `ansible/...`, `infra/...` and `Jenkinsfile` are relative to `deploy/`. On the server the Ansible tree stays at `~/MDS-service/ansible`. The repository's main pipeline (`/Jenkinsfile`) builds the ECR images and runs these playbooks from that server copy; `deploy/Jenkinsfile` is an optional manual job that first syncs `deploy/ansible/` to the server.

| Compose feature (README) | Kubernetes equivalent in this repo |
|---|---|
| `mds-standalone-api` (FastAPI :8000 → 8044) | `Deployment/mds-api` + `Service` + `Ingress` (`https://<api-host>`), HPA, PDB |
| `mds-standalone-ui` (Next.js :3000 → 3005) | `Deployment/mds-ui` + `Service` + `Ingress` (`https://<ui-host>`), HPA, PDB |
| Mock IAM on :8020 inside UI container | `mock-iam` **sidecar** in the UI pod (reachable at `localhost:8020`) |
| `patch_api.py`, `patch_ui.js`, sidebar scripts (bind mounts) | `ConfigMap/mds-hooks` mounted at `/opt/mds-hooks`, run before app start |
| `mds-standalone-postgres` (PG16, volume `mds_pgdata`) | `StatefulSet/mds-postgres` + PVC (private, no ingress) |
| `mds-standalone-minio` (volume `mds_miniodata`, bucket `openg2p-geo`) | `StatefulSet/mds-minio` + PVC + bucket-init `Job` (private; console optional) |
| Health checks (README 6.5) | startup/readiness/liveness probes: `/ping`, `/en`, `pg_isready`, MinIO health |
| Backups (README 6.6) | `CronJob/mds-backup` (pg_dump + MinIO mirror + retention + optional S3), `backup.yml`, `restore.yml` |
| Catalog import scripts (README 5) | `playbooks/04-seed-catalogs.yml` |
| Option A standalone / Option B Keycloak (README 6.3) | `mds_standalone_mode: true/false` |
| Ports exposure table (README 6.1) | Security group (80/443 public, 22/6443 admin) + NetworkPolicies |
| TLS termination (README 6.7) | ingress-nginx + cert-manager (Let's Encrypt or self-signed) |

### Environments at a glance

One cluster hosts two fully isolated MDS stacks, each in its own **namespace**:

| | `develop` | `staging` |
|---|---|---|
| Namespace | `develop` | `staging` |
| Settings / secrets | `ansible/environments/develop/{main,vault}.yml` | `ansible/environments/staging/{main,vault}.yml` |
| UI / API host (example) | `mds-dev.example.gov` / `mds-api-dev.example.gov` | `mds-staging.example.gov` / `mds-api-staging.example.gov` |
| Replicas / HPA | 1 / off | 2 / 2–4 |
| PostgreSQL / MinIO PVC | 10Gi / 10Gi | 20Gi / 20Gi |
| Backups | 00:30 UTC, keep 3 days | 01:00 UTC, keep 14 days |
| Purpose | integration, new image tags, catalog experiments | release validation, UAT, mirrors production sizing |

Each environment has its own PostgreSQL, MinIO, secrets, certificates, NetworkPolicies and backup CronJob. Nothing is shared between namespaces except the ingress controller and cert-manager.

**Every app playbook needs `-e mds_env=develop` or `-e mds_env=staging`.** The commands in this runbook use a shell variable. Set it once per terminal (the namespace has the same name as the environment):

```bash
export MDS_ENV=develop     # or: export MDS_ENV=staging
```

> The table above is the generic design. The section below records what is **actually deployed** today; where they differ (sizing, hostnames), the live section wins.

---

## Live deployment: MDS-dev-staging server (as of 2026-10-14)

### URLs

Develop has public DNS: Route 53 A records `mds-dev.oanstaging.com` and `mds-api-dev.oanstaging.com` (zone `oanstaging.com`) -> `13.126.71.6`. Staging and Rancher still need this line in the hosts file of every client (`C:\Windows\System32\drivers\etc\hosts` on Windows, `/etc/hosts` on Linux/macOS). `*.mda.test` is not public DNS:

```
13.126.71.6  rancher.mda.test mds-staging.mda.test mds-api-staging.mda.test keycloak.mda.test
```

| What | Develop | Staging |
|---|---|---|
| Catalogue (UI) | https://mds-dev.oanstaging.com/en/datasets | https://mds-staging.mda.test/en/datasets |
| UI home | https://mds-dev.oanstaging.com/en | https://mds-staging.mda.test/en |
| One list (example) | https://mds-dev.oanstaging.com/en/datasets/CROP_CATALOG | https://mds-staging.mda.test/en/datasets/CROP_CATALOG |
| API base | https://mds-api-dev.oanstaging.com | https://mds-api-staging.mda.test |
| API docs (Swagger) | https://mds-api-dev.oanstaging.com/docs | https://mds-api-staging.mda.test/docs |
| API health | https://mds-api-dev.oanstaging.com/ping | https://mds-api-staging.mda.test/ping |
| Kubernetes namespace | `develop` | `staging` |

Cluster management (Rancher): https://rancher.mda.test (user `admin`; the one-time bootstrap password is in `~/rancher-bootstrap-password` on the server).

Develop uses trusted Let's Encrypt certificates (`tls_cluster_issuer: letsencrypt-prod`, HTTP-01, auto-renewed by cert-manager; needs port 80 open). Staging and Rancher use self-signed certificates (`selfsigned`), so browsers show a warning to accept there.

### Login: Keycloak (since 2026-10-16)

One shared Keycloak (namespace `keycloak`, `quay.io/keycloak/keycloak:26.7.5` + its own `postgres:16`) holds a realm per environment. The UI sends people to the Keycloak login page; the API accepts only Keycloak tokens of that realm.

| | Develop | Staging |
|---|---|---|
| Realm | `mds-develop` | `mds-staging` |
| Login page / issuer | https://keycloak-dev.oanstaging.com/realms/mds-develop | https://keycloak.mda.test/realms/mds-staging (hosts file) |
| Admin console (both realms) | https://keycloak-dev.oanstaging.com/admin/ (user `kc-admin`) | |
| Client | `master-data` (confidential, secret in Secret `mds-keycloak`) | same |

Roles (client roles of `master-data`) and the maker-checker workflow:

| Role | Can | Test user |
|---|---|---|
| `MASTER_DATA_MAKER` | create/edit/delete lists and geography, open drafts, submit them | `mds-maker` |
| `MASTER_DATA_CHECKER` | approve or reject submitted drafts, publish releases | `mds-checker` |
| `MASTER_DATA_ADMIN` | everything | `mds-admin` |

The API itself enforces maker ≠ checker by user id: whoever created, edited or submitted a draft cannot approve it, admins included. Mapping role → permissions: `mds_role_permissions` in `inventory/group_vars/all/main.yml`.

Passwords (on the server):

```bash
K="sudo /var/lib/rancher/rke2/bin/kubectl --kubeconfig /etc/rancher/rke2/rke2.yaml"
$K -n keycloak get secret keycloak-admin -o jsonpath='{.data.KC_BOOTSTRAP_ADMIN_PASSWORD}' | base64 -d; echo
$K -n develop get secret mds-keycloak-users -o go-template='{{range $k,$v := .data}}{{$k}}: {{$v|base64decode}}{{"\n"}}{{end}}'   # or -n staging
```

The Secret holds the **initial** passwords; a password changed in Keycloak is not written back.

**Add a user:** either add them to `mds_keycloak_users` (all realms) or `mds_keycloak_users` in `environments/<env>/main.yml` and re-run `05-keycloak.yml`, or in the admin console: realm → Users → Add user → Credentials → Set password (temporary off) → Role mapping → Assign role → filter *clients* → `master-data` → pick the role.

How it works: `mock_iam.js` (UI sidecar) is an OIDC bridge (authorization code + PKCE, code exchange over the internal service URL) and stores the Keycloak access token in the `X-Access-Token` cookie; `sitecustomize.py` in the API verifies that JWT (JWKS, issuer, `azp`, expiry) and maps its roles to permissions. Tokens live 1 h; after that the UI bounces through Keycloak, which logs the user straight back in while the SSO session (8 h idle / 12 h max) lasts. Logout ends the Keycloak session too.

### Infrastructure

| Item | Value |
|---|---|
| Cloud / region | AWS `ap-south-1` (Mumbai) |
| Instance | `i-0735a96ce6f0b810d`, `t3.xlarge` (4 vCPU, 16 GB RAM; `t3.large` until 2026-10-16), Ubuntu 24.04 LTS, 29 GB root disk |
| Public / private IP | `13.126.71.6` / `10.0.1.51` (subnet `10.0.1.0/24`) |
| Public DNS | `ec2-13-126-71-6.ap-south-1.compute.amazonaws.com` |
| SSH | `ssh -i "MDS-dev-staging.pem" ubuntu@ec2-13-126-71-6.ap-south-1.compute.amazonaws.com` (key in the repo root, gitignored) |
| Kubernetes | single-node **RKE2** `v1.35.9+rke2r1`, node `mds-dev-1` (control-plane + etcd + workloads), containerd |
| kubectl on the server | `/var/lib/rancher/rke2/bin/kubectl` with `KUBECONFIG=~/.kube/config` (or `/etc/rancher/rke2/rke2.yaml`) |
| Ingress | RKE2 bundled ingress-nginx (`kube-system`, hostNetwork, ports 80/443) |
| Storage | `local-path` provisioner (volumes on the node's disk) |
| Also installed | Rancher, cert-manager, Fleet, CAPI/Turtles (Rancher components) |

### What runs in each namespace

| Component | Image | Notes |
|---|---|---|
| `mds-api` (1 replica) | `openg2p/master-data-api:develop` | FastAPI; runs the DB migration on start |
| `mds-ui` (1 replica) | `openg2p/master-data-ui:develop` + `node:20-alpine` mock-IAM sidecar | Keycloak login (sidecar = OIDC bridge) |
| `mds-postgres` | `postgres:16` | DB `master_data` |
| `mds-minio` | `pgsty/minio:RELEASE.2026-08-04T00-00-00Z` | bucket `openg2p-geo` (GeoJSON boundaries) |
| `mds-minio-init` (Job) | `pgsty/mc:RELEASE.2026-09-16T00-00-00Z` | creates the bucket |
| `mds-seed` (Job) | `openg2p/master-data-db-seed:develop` | official ETH country pack |
| `mds-backup` (CronJob) | postgres + mc | develop 00:30 UTC (keep 3 days), staging 01:00 UTC (keep 7 days) |

### Data loaded (both environments, all published as version 1)

| Domain | Lists | Source |
|---|---|---|
| Geography | ETH: 1 country, 15 regions, 107 zones, 1,148 woredas (1,271 units) + boundaries in MinIO | official ETH pack (OCHA COD-AB, CC BY-IGO) |
| `core` | 34 lists (social registry code lists) | official ETH pack |
| `agriculture` | 26 lists (crop commodity, seed variety, irrigation, pests, livestock type/breed, …) | official ETH pack |
| `crops` | `CROP_CATALOG` 150, `CROP_CATEGORY` 7, `CROP_VARIETY` 902, `ECOLOGICAL_ZONE` 3 | OAN catalogue seed data (see below) |
| `livestock` | `LIVESTOCK_SPECIES_CATALOG` 5, `LIVESTOCK_BREED_CATALOG` 94, `LIVESTOCK_POPULATION` 40, `LIVESTOCK_GENDER` 4, `LIVESTOCK_PRODUCTION_TYPE` 13, `LIVESTOCK_BODY_CONDITION` 5, `LIVESTOCK_RECORD_STATUS` 6 | OAN catalogue seed data |
| `seeds` | `CERTIFIED_SEED_CATALOG` 129, `SEED_DEMAND_SUMMARY` 1, `SEED_DEMAND_TREND` 5, `SEED_DEMAND_BY_CROP` 18 | OAN catalogue seed data |

The crops/livestock/seeds lists replace the README's `import_all_catalogs.py` (which was never available). Their source is `D:\projects\Gen2\dashboard and catalog\oan_catalog_master_data_management\scripts\seed_db_sql\`. Extra fields (scientific name, Amharic name, release year, census and demand figures) and links to other lists (variety → crop, crop → category / ecological zone, breed → species, demand → seed) are in each value's `attributes`. The official pack already owns `LIVESTOCK_SPECIES` and `LIVESTOCK_BREED`, so the new lists use different ids; never reuse an official list id.

### Operating it

Ansible runs **on the server** against its own cluster:

```bash
ssh -i "MDS-dev-staging.pem" ubuntu@ec2-13-126-71-6.ap-south-1.compute.amazonaws.com
source ~/.venvs/ansible/bin/activate
cd ~/MDS-service/ansible
V="--vault-password-file ~/.mds_vault_pass"

ansible-playbook playbooks/05-keycloak.yml                       # shared Keycloak + realms/users (before 03)
ansible-playbook playbooks/03-deploy-mds.yml   -e mds_env=develop $V   # or staging
ansible-playbook playbooks/04-seed-catalogs.yml -e mds_env=develop $V   # official ETH pack
ansible-playbook playbooks/verify.yml          -e mds_env=develop -e verify_external=false $V
```

- Edit the files in this repo, then copy them to `~/MDS-service/ansible/` on the server with `scp` (and run `sed -i 's/\r$//' <file>` there to strip Windows line endings).
- Secrets: `environments/develop/vault.yml` and `environments/staging/vault.yml` exist **only on the server** (random values, encrypted with `~/.mds_vault_pass`). Back up `~/.mds_vault_pass`; without it the vaults cannot be decrypted.

**Reloading the crops / livestock / seeds lists** (e.g. after a rebuild or when the source data changes):

1. Load the source into a scratch database: apply `oan_catalog_master_data_management/scripts/migrations/*.sql` in order, then `seed_db_sql/import_catalog_related.sql`, `import_crop_catalog.sql`, `import_seed_data.sql`, `import_seed_variety.sql`, `import_livestock_data.sql`.
2. Convert: `psql -d <scratch> -tA -F $'\t' -f ansible/files/catalog-scripts/agri_catalogs_to_pack.sql > lists.tsv`, then `python3 ansible/files/catalog-scripts/write_agri_pack.py lists.tsv ~/agri-pack`.
3. Load with the official loader in a pod labelled `app.kubernetes.io/name: mds-seed` (the NetworkPolicy only lets that label reach PostgreSQL), image `openg2p/master-data-db-seed:develop`, PG env from the `mds-postgres` secret:
   `python /seed/load_geo_pack.py --pack /tmp/agri-pack --load codelists --domains crops,livestock,seeds --actor oan-catalogue-import`
4. Re-running is safe: unchanged lists are skipped; changed lists become a DRAFT to approve in the UI. Drop the scratch database afterwards.

### Capacity

Since 2026-10-16 the node is a `t3.xlarge` (4 vCPU). CPU **requests**: RKE2 + Rancher ≈ 1685m, each MDS environment ≈ 150m, Keycloak + its PostgreSQL 300m, so ~2.3 of 4 vCPU. The settings below date from the 2-vCPU node, when requests were at ~1985m of 2000m; they still work, and can be relaxed now:

- Both environments run 1 API + 1 UI replica, HPA off, and minimal CPU requests (`mds_*_resources` in `environments/*/main.yml`); limits still allow bursting.
- Deploys replace pods in place (`mds_rollout_max_unavailable: 1`, `mds_rollout_max_surge: 0`): a brief outage on each deploy.
- Seed jobs request `1m` CPU (`mds_seed_resources`).
- **Staging is not production-sized.** For production-like staging (2 replicas, HPA) or anything new (including workloads added through Rancher), resize to `t3.xlarge` (4 vCPU / 16 GB) or add a node. A stop/start changes the public IP unless it is an Elastic IP; update the hosts files if it does.
- Disk: ~13 GB free; `local-path` does not enforce PVC sizes, so watch `df -h /` on the server.

### Fixes applied during the first deployment

| Problem | Fix |
|---|---|
| MinIO pods stuck in `ImagePullBackOff`: MinIO no longer publishes public images (Docker Hub / quay.io denied, binaries 410) | `mds_minio_image` / `mds_mc_image` switched to the community builds `pgsty/minio` / `pgsty/mc` (`inventory/group_vars/all/main.yml`) |
| StatefulSet kept the old broken MinIO pod after the image change | `kubectl -n <env> delete pod mds-minio-0` (a never-Ready pod is not rolled automatically) |
| API connected to `localhost:5432`, so no tables were created | the DB engine reads `COMMON_DB_*`, not `MASTER_DATA_API_DB_*`; both are now set (`configmaps.yaml.j2`, `api.yaml.j2`) |
| Seed / new pods `Pending: Insufficient cpu` | configurable `mds_seed_resources`, `mds_rollout_max_*`, smaller requests (see Capacity) |
| Loader drafted a change over the official `LIVESTOCK_SPECIES` list | draft discarded through `POST /catalogue/discard_draft`; new list renamed `LIVESTOCK_SPECIES_CATALOG` |

---

## 0. Contents

- [Live deployment: MDS-dev-staging server](#live-deployment-mds-dev-staging-server-as-of-2026-10-14) (URLs, infrastructure, data, operations)

1. [Architecture](#1-architecture)
2. [Prerequisites](#2-prerequisites)
3. [Inputs to collect from the compose repo (required)](#3-inputs-to-collect-from-the-compose-repo-required)
4. [Repository layout](#4-repository-layout)
5. [Phase 1: Provision infrastructure (Terraform)](#5-phase-1-provision-infrastructure-terraform)
6. [Phase 2: Set up the Ansible controller](#6-phase-2-set-up-the-ansible-controller)
7. [Phase 3: Configure variables and secrets](#7-phase-3-configure-variables-and-secrets)
8. [Phase 4: Build the cluster and deploy](#8-phase-4-build-the-cluster-and-deploy)
9. [Phase 5: DNS and TLS](#9-phase-5-dns-and-tls)
10. [Phase 6: Seed catalogs](#10-phase-6-seed-catalogs)
11. [Phase 7: Verify](#11-phase-7-verify)
12. [Day-2 operations](#12-day-2-operations)
13. [Backup and disaster recovery](#13-backup-and-disaster-recovery)
14. [Switching to Keycloak / IAM (Option B)](#14-switching-to-keycloak--iam-option-b)
15. [Troubleshooting](#15-troubleshooting)
16. [Security notes](#16-security-notes)
17. [Go-live checklist](#17-go-live-checklist)
18. [Teardown](#18-teardown)
19. [Pointing the Gen2 dev environment (far / live / crop) at this MDS](#19-pointing-the-gen2-dev-environment-far--live--crop-at-this-mds)

---

## 1. Architecture

```
                         Internet / Corporate network
                                     │  80/443 (allowlist / basic-auth optional)
                       ┌─────────────▼──────────────┐
                       │ ingress-nginx (LB, 2 reps) │◄── cert-manager (Let's Encrypt)
                       └──────┬──────────────┬──────┘
          mds-dev / mds-api-dev│              │mds-staging / mds-api-staging
   ┌───────────────────────────▼───┐   ┌──────▼────────────────────────┐
   │ namespace: develop            │   │ namespace: staging            │
   │                               │   │                               │
   │  mds-ui ──► mds-api           │   │  mds-ui ──► mds-api           │
   │  (ui + mock-iam)  (:8000)     │   │  (ui + mock-iam)  (:8000)     │
   │  1 replica each, no HPA       │   │  2 replicas each, HPA 2..4    │
   │        │         │            │   │        │         │            │
   │   postgres     minio          │   │   postgres     minio          │
   │   PVC 10Gi     PVC 10Gi       │   │   PVC 20Gi     PVC 20Gi       │
   │   CronJob mds-backup (3 days) │   │   CronJob mds-backup (14 days)│
   │   default-deny NetworkPolicy  │   │   default-deny NetworkPolicy  │
   └───────────────────────────────┘   └───────────────────────────────┘
   k3s cluster: 1 server (control-plane) + N agents, Ubuntu 22.04, flannel + kube-router netpol
```

Each namespace contains the same objects: `Deployment/mds-ui` (with the `ui` and `mock-iam` containers), `Deployment/mds-api`, `StatefulSet/mds-postgres`, `StatefulSet/mds-minio`, `CronJob/mds-backup`, ingresses and NetworkPolicies.

**Network rules (per namespace):** a default-deny NetworkPolicy covers the whole namespace, so develop pods cannot reach staging pods and vice versa. ingress-nginx can reach `mds-ui:3000` and `mds-api:8000`. `mds-ui` can reach `mds-api`. Only `mds-api` and the backup job can reach PostgreSQL. Only the API, bucket-init and backup pods can reach MinIO.

---

## 2. Prerequisites

| Item | Version | Notes |
|---|---|---|
| Linux / macOS / **WSL2** shell | | Ansible does not run natively on Windows. On Windows use WSL2 Ubuntu: `wsl --install -d Ubuntu-22.04` |
| Terraform | ≥ 1.6 | Only if you provision on AWS with the included module |
| AWS credentials | | `aws configure` or SSO profile with EC2/VPC rights |
| Python | ≥ 3.10 | On the controller |
| Ansible core | ≥ 2.16 | `pip install "ansible-core>=2.16" passlib` |
| SSH key pair | | `ssh-keygen -t ed25519 -f ~/.ssh/mds` |
| Nodes | Ubuntu 22.04/24.04 | Min **2 vCPU / 8 GiB / 80 GiB** per node. For develop + staging, use 1 server + 1 agent of `t3.large`, or `t3.xlarge` if staging autoscales often |
| DNS | | Four records you control: UI + API for each environment (see §9) |
| Container images | | MDS API and UI images (same as in `docker-compose.yml`) pullable from the nodes |

Using an **existing Kubernetes cluster** (EKS/AKS/GKE/RKE2)? Skip Phase 1 and the `00`/`01` playbooks, then follow §8.3.

---

## 3. Inputs to collect from the compose repo (required)

The README describes the standalone stack but does not contain these artifacts. Get them from the original `master-data-standalone` repository (the one with `docker-compose.yml`) **before deploying**:

| # | What | Where it goes |
|---|---|---|
| 1 | API image (`image:` of `master-data-api`) | `mds_api_image` in `ansible/inventory/group_vars/all/main.yml` |
| 2 | UI image (`image:` of `master-data-ui`) | `mds_ui_image` |
| 3 | API start command | `mds_api_start_command` |
| 4 | UI start command | `mds_ui_start_command` |
| 5 | Env var names the API uses for DB host/port/name/user/password and MinIO | `mds_api_db_env_names`, `mds_api_minio_env_names` |
| 6 | Any other env vars on api/ui services, **especially the UI's Master Data API URL variable**. In Kubernetes, set it to `http://mds-api:8000` for server-side calls, or `https://<api-host>` if the browser calls the API directly | `mds_api_extra_env`, `mds_ui_extra_env` (secrets → see §7.3) |
| 7 | `mock_iam.js`, `patch_ui.js`, `patch_api.py`, `customize_sidebar.js`, `reorder_sidebar.js` | `ansible/files/mds-hooks/` |
| 8 | `import_all_catalogs.py`, `add_geography_to_catalogs.py` | `ansible/files/catalog-scripts/` |

Find the image's original start command (needed because the hooks must run **before** the app starts):

```bash
docker inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}' <api-image>
docker inspect --format '{{json .Config.Entrypoint}} {{json .Config.Cmd}}' <ui-image>
# or read `command:` / `entrypoint:` in docker-compose.yml
```

Example: if the API shows `null ["gunicorn","-c","/app/gunicorn_conf.py","main:app"]`, set `mds_api_start_command: gunicorn -c /app/gunicorn_conf.py main:app`.

Find the DB and MinIO env names:

```bash
docker compose config | sed -n '/master-data-api:/,/^  [a-z]/p' | grep -A80 environment
```

> The UI hooks patch files inside the Next.js image at startup, so the UI container's filesystem must be writable by the container user. That is the default, since the deployment does not set `readOnlyRootFilesystem` on the `ui` container.

---

## 4. Repository layout

```
MDS-service/
├── RUNBOOK.md                         ← this file
├── infra/terraform/aws/               ← VPC, subnet, SG, EC2 nodes, EIP, generated inventory
└── ansible/
    ├── ansible.cfg, requirements.yml
    ├── inventory/
    │   ├── hosts.ini(.example)         ← generated by Terraform or written by hand
    │   └── group_vars/all/
    │       ├── main.yml                ← SHARED defaults (images, start commands, env names, toggles)
    │       └── vault.yml(.example)     ← shared secrets: registry, remote backup S3 (optional)
    ├── environments/
    │   ├── develop/main.yml            ← namespace "develop": hosts, sizing, backups
    │   ├── develop/vault.yml(.example) ← develop secrets (PostgreSQL, MinIO, basic auth)
    │   ├── staging/main.yml            ← namespace "staging"
    │   └── staging/vault.yml(.example) ← staging secrets
    ├── files/
    │   ├── mds-hooks/                  ← standalone hook scripts (§3 item 7)
    │   └── catalog-scripts/            ← seed scripts (§3 item 8)
    ├── playbooks/
    │   ├── site.yml                    ← 00 → 01 → 02 → 03 (develop, staging) → verify (both)
    │   ├── tasks/load-env.yml          ← loads environments/<mds_env>/* (used by all app playbooks)
    │   ├── 00-prepare-hosts.yml        ← OS packages, swap off, sysctl, modules
    │   ├── 01-k8s-cluster.yml          ← k3s server + agents, kubectl, helm, python k8s client
    │   ├── 02-platform.yml             ← ingress-nginx, cert-manager, ClusterIssuers
    │   ├── 03-deploy-mds.yml           ← MDS (idempotent; also used for upgrades)
    │   ├── 04-seed-catalogs.yml        ← import catalogs into PostgreSQL
    │   ├── verify.yml                  ← health checks in-cluster + via ingress
    │   ├── backup.yml / restore.yml    ← on-demand backup / restore
    │   └── teardown.yml                ← delete MDS (and optionally k3s)
    └── roles/ common, k3s_server, k3s_agent, kube_tools, platform, mds
```

---

## 5. Phase 1: Provision infrastructure (Terraform)

> Skip if you already have Ubuntu VMs: write `ansible/inventory/hosts.ini` by hand from `hosts.ini.example` and open the ports listed in the table below.

```bash
cd infra/terraform/aws
cp terraform.tfvars.example terraform.tfvars
$EDITOR terraform.tfvars          # set admin_cidrs (your IP/VPN!), region, sizes, key paths

terraform init
terraform plan -out tfplan
terraform apply tfplan
terraform output                  # server_public_ip, ssh_command, inventory path
```

**What gets created:** VPC, public subnet, IGW, route table, a security group, 1 × k3s server with an Elastic IP, N × k3s agents (gp3 encrypted, IMDSv2), and the generated `ansible/inventory/hosts.ini`.

| Port | Source | Purpose |
|---|---|---|
| 22 | `admin_cidrs` | SSH / Ansible |
| 6443 | `admin_cidrs` | Kubernetes API (kubectl from your laptop) |
| 80, 443 | `public_ingress_cidrs` | MDS UI/API via ingress, ACME HTTP-01 |
| all | the SG itself | Node-to-node (flannel, kubelet) |
| 5432 / 9000 / 9001 | **never** | PostgreSQL / MinIO stay inside the cluster |

Smoke test: `ssh -i ~/.ssh/mds ubuntu@<server_public_ip> uptime`

---

## 6. Phase 2: Set up the Ansible controller

```bash
# (Windows → inside WSL2 Ubuntu)
sudo apt update && sudo apt install -y python3-venv python3-pip git openssh-client
python3 -m venv ~/.venvs/mds-ansible && source ~/.venvs/mds-ansible/bin/activate
pip install "ansible-core>=2.16" passlib kubernetes

cd <repo>/ansible
ansible-galaxy collection install -r requirements.yml -p ./collections
ansible all -m ping               # every host must answer "pong"
```

> On WSL with the repo on `D:\`, Ansible ignores `ansible.cfg` in world-writable folders. Either clone the repo into the WSL home directory (`~/MDS-service`), or `export ANSIBLE_CONFIG=$PWD/ansible.cfg`. Also make sure the private key has `chmod 600` (copy it into `~/.ssh` inside WSL).

---

## 7. Phase 3: Configure variables and secrets

Settings are layered. `environments/<env>/main.yml` overrides `inventory/group_vars/all/main.yml`. Put anything common to both environments in group_vars, and anything that differs in the environment file.

### 7.1 Shared settings: `inventory/group_vars/all/main.yml`

```yaml
acme_email: devops@example.gov

mds_api_image: <from §3>                 # default for both envs (override per env if needed)
mds_ui_image: <from §3>
mds_api_start_command: <from §3>
mds_ui_start_command: <from §3>
mds_api_db_env_names: {...}              # verify names against compose
mds_api_minio_env_names: {...}
```

Other shared tunables: `mds_storage_class`, standalone/IAM mode, catalogue country/approval mode, remote backup S3. Every one is commented in the file.

### 7.2 Per-environment settings: `environments/develop/main.yml` and `environments/staging/main.yml`

```yaml
mds_environment: develop                 # label + preflight strictness
mds_namespace: develop                   # Kubernetes namespace
mds_ui_host: mds-dev.example.gov
mds_api_host: mds-api-dev.example.gov
tls_cluster_issuer: letsencrypt-prod     # letsencrypt-staging while testing DNS, selfsigned if air-gapped

# mds_api_image: ...:<newer-tag>         # e.g. develop runs ahead of staging

mds_api_replicas: 1
mds_hpa_enabled: false
mds_postgres_storage: 10Gi
mds_backup_retention_days: 3

# Standalone mode logs everyone in as ADMIN, so restrict who can reach it:
mds_ingress_allowlist_cidrs: ["203.0.113.0/24"]
mds_ingress_basic_auth_enabled: true
```

Any variable from group_vars can be overridden here, including resources, replicas, backup schedule and images.

### 7.3 Secrets (ansible-vault), one vault per environment

```bash
for e in develop staging; do
  cp environments/$e/vault.yml.example environments/$e/vault.yml
  $EDITOR environments/$e/vault.yml          # openssl rand -base64 32 for each password, DIFFERENT per env
  ansible-vault encrypt environments/$e/vault.yml
done

# optional shared secrets (private registry, remote backup S3):
cp inventory/group_vars/all/vault.yml.example inventory/group_vars/all/vault.yml
ansible-vault encrypt inventory/group_vars/all/vault.yml

echo 'my-vault-password' > .vault_pass && chmod 600 .vault_pass   # optional; gitignored
# then either add --ask-vault-pass to each command or uncomment vault_password_file in ansible.cfg
```

Use one vault password for all files, or separate ones with `--vault-id develop@prompt --vault-id staging@prompt`.

In `production`, preflight refuses to deploy with `CHANGE_ME`, `minioadmin` or `password` values, or with the Let's Encrypt staging issuer.

### 7.4 Hook and seed files

```bash
cp <compose-repo>/{mock_iam.js,patch_ui.js,patch_api.py,customize_sidebar.js,reorder_sidebar.js} files/mds-hooks/
cp <compose-repo>/{import_all_catalogs.py,add_geography_to_catalogs.py} files/catalog-scripts/
```

---

## 8. Phase 4: Build the cluster and deploy

### 8.1 One shot

```bash
cd ansible
ansible-playbook playbooks/site.yml -e verify_external=false     # builds the cluster, deploys develop AND staging
```

Don't pass `-e mds_env` to `site.yml`. Extra vars override both imports, so the same environment would be deployed twice.

### 8.2 Step by step (recommended the first time)

| Step | Command | Expected result |
|---|---|---|
| Hosts | `ansible-playbook playbooks/00-prepare-hosts.yml` | packages installed, swap off |
| Cluster | `ansible-playbook playbooks/01-k8s-cluster.yml` | all nodes `Ready`; `artifacts/kubeconfig` written |
| Platform | `ansible-playbook playbooks/02-platform.yml` | ingress-nginx + cert-manager running; prints ingress IP |
| MDS | `ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=$MDS_ENV` | preflight OK → PG/MinIO ready → bucket created → API/UI rolled out → ingress/HPA/netpol/backup applied |
| Verify | `ansible-playbook playbooks/verify.yml -e mds_env=$MDS_ENV -e verify_external=false` | `pg_isready` OK, `/ping` 200, `/en` 200/3xx, mock IAM 200 |

Run the MDS and Verify steps once with `MDS_ENV=develop` and once with `MDS_ENV=staging`:

```bash
for MDS_ENV in develop staging; do
  ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=$MDS_ENV
  ansible-playbook playbooks/verify.yml        -e mds_env=$MDS_ENV -e verify_external=false
done
kubectl get ns develop staging
```

### 8.3 Existing cluster (EKS/AKS/GKE/RKE2)

1. In `hosts.ini`, put a bastion host (or `localhost ansible_connection=local`) in `[kube_control]`. Leave `[k3s_*]` empty.
2. Set `kubeconfig_path` to that host's kubeconfig, and `mds_storage_class` to the cluster's class (e.g. `gp3`, `managed-csi`, `standard-rwo`).
3. If the cluster already has an ingress controller and cert-manager, skip `02` (keep `ingressClassName: nginx`, or adjust the template). Otherwise run `02`.
4. Run `03`, `04`, then `verify`. Make sure the cluster's CNI enforces NetworkPolicy (Calico/Cilium, or the AWS VPC CNI with network policy enabled).

### 8.4 kubectl access

- **On the server:** `ssh ubuntu@<server>`, then `kubectl get pods -n develop` or `-n staging`. The aliases `k`, `kdev` (`kubectl -n develop`) and `kstg` (`kubectl -n staging`) are preinstalled.
- **Default namespace for a shell:** `kubectl config set-context --current --namespace=$MDS_ENV`
- **From your workstation:** `export KUBECONFIG=$PWD/artifacts/kubeconfig`, then `kubectl get nodes`. Your IP must be in `admin_cidrs`.

---

## 9. Phase 5: DNS and TLS

1. Get the ingress IP. `02-platform.yml` prints it, or run `kubectl -n ingress-nginx get svc ingress-nginx-controller`. On k3s this is the node IP(s); with Terraform, use `server_public_ip`.
2. Create DNS **A** records for both environments, all pointing at the same ingress IP:

   | Record | Environment |
   |---|---|
   | `mds-dev.example.gov` | develop UI |
   | `mds-api-dev.example.gov` | develop API |
   | `mds-staging.example.gov` | staging UI |
   | `mds-api-staging.example.gov` | staging API |

   ingress-nginx routes by hostname to the right namespace. A wildcard such as `*.mds.example.gov` also works if you change the hostnames in the environment files to match.
3. Check: `dig +short mds-dev.example.gov mds-staging.example.gov`
4. cert-manager issues certificates automatically. Track it with:
   ```bash
   kubectl -n $MDS_ENV get certificate,certificaterequest,order,challenge
   ```
5. With `letsencrypt-staging` working, set `tls_cluster_issuer: letsencrypt-prod`, re-run `03-deploy-mds.yml`, then delete the old secrets so they are re-issued: `kubectl -n $MDS_ENV delete secret mds-ui-tls mds-api-tls`.
6. **Air-gapped or no public DNS:** use `tls_cluster_issuer: selfsigned`, or create the `mds-ui-tls` / `mds-api-tls` secrets from your corporate CA (`kubectl -n $MDS_ENV create secret tls mds-ui-tls --cert=... --key=...`) and remove the `cert-manager.io/cluster-issuer` annotation.

---

## 10. Phase 6: Seed catalogs

```bash
ansible-playbook playbooks/04-seed-catalogs.yml -e mds_env=$MDS_ENV
# only geography:
ansible-playbook playbooks/04-seed-catalogs.yml -e mds_env=$MDS_ENV -e '{"mds_seed_scripts":["add_geography_to_catalogs.py"]}'
```

Expected counts after seeding (from the README):

| Domain | Catalogs |
|---|---|
| Crop | Crop Catalog 129 · Categories 7 · Varieties 902 · Ecological Zones 3 |
| Livestock | Species 5 · Breeds 94 · Populations 40 · Genders 4 · Production Types 13 · Body Conditions 5 · Record Statuses 6 |
| Seed | Certified Seed 129 · Demand Summary 1 · Demand Trend 5 · Demand by Crop 18 |
| Geography | Regions 14 · Zones 125 · Woredas 1,359 |

Manual equivalent:

```bash
POD=$(kubectl -n $MDS_ENV get pod -l app.kubernetes.io/name=mds-api -o jsonpath='{.items[0].metadata.name}')
kubectl -n $MDS_ENV cp files/catalog-scripts/import_all_catalogs.py $POD:/tmp/import_all_catalogs.py -c api
kubectl -n $MDS_ENV exec $POD -c api -- python /tmp/import_all_catalogs.py
```

> **Take a backup before re-seeding** an environment that already has data (§13). Whether the scripts are idempotent depends on the scripts themselves.

---

## 11. Phase 7: Verify

```bash
ansible-playbook playbooks/verify.yml -e mds_env=$MDS_ENV          # includes external HTTPS checks
```

Manual checks:

```bash
kubectl -n $MDS_ENV get pods,svc,ingress,pvc,hpa,cronjob,certificate
curl -fsS https://mds-api-dev.example.gov/ping          # develop
curl -fsS https://mds-api-staging.example.gov/ping      # staging
curl -sI  https://mds-dev.example.gov/en                # 200 (or redirect), never a 508 loop
open https://mds-api-staging.example.gov/docs           # Swagger
```

Functional acceptance (UI):

1. Open `https://<ui-host>`. You should be auto-logged in as Admin (standalone mode).
2. The sidebar shows **Crops, Livestock, Seeds, Geography, All Catalogs** (proves the sidebar hooks ran).
3. Open a catalog, **create a draft v2**, edit an entry, and **submit for approval**.
4. **Compare versions** (side-by-side diff), **approve**, then confirm the version is **Published & immutable** with an effective date.
5. Geography: upload or view a GeoJSON boundary. This proves MinIO and the `openg2p-geo` bucket work.

---

## 12. Day-2 operations

### 12.1 Common commands

```bash
kubectl -n $MDS_ENV get pods -o wide
kubectl -n $MDS_ENV logs deploy/mds-api -f
kubectl -n $MDS_ENV logs deploy/mds-ui -c ui -f
kubectl -n $MDS_ENV logs deploy/mds-ui -c mock-iam
kubectl -n $MDS_ENV describe pod <pod>
kubectl -n $MDS_ENV top pods                                # metrics-server ships with k3s
kubectl -n $MDS_ENV exec -it mds-postgres-0 -- psql -U postgres -d master_data
kubectl -n $MDS_ENV port-forward svc/mds-minio 9011:9001    # MinIO console on http://localhost:9011
kubectl -n $MDS_ENV port-forward svc/mds-postgres 5434:5432 # psql from laptop on localhost:5434
```

### 12.2 Upgrade MDS (promote develop → staging)

New versions always go to **develop first**, then get promoted to **staging**.

1. **develop:** set the new `mds_api_image` / `mds_ui_image` tags in `environments/develop/main.yml`, and re-check that the hooks still apply to the new image version.
2. Back up, deploy and verify develop:
   ```bash
   ansible-playbook playbooks/backup.yml       -e mds_env=develop
   ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=develop
   ansible-playbook playbooks/verify.yml       -e mds_env=develop
   ```
3. Test the maker-checker flow on develop (§11).
4. **Promote:** copy the same tags into `environments/staging/main.yml`, or into group_vars once both environments run them, then repeat step 2 with `-e mds_env=staging`.

Every deploy is a rolling update with `maxUnavailable: 0`.

Config-only changes (env, hooks) also trigger a rollout, because pods carry a `checksum/config` annotation.

### 12.3 Rollback

```bash
kubectl -n $MDS_ENV rollout history deploy/mds-api
kubectl -n $MDS_ENV rollout undo deploy/mds-api            # or --to-revision=N
kubectl -n $MDS_ENV rollout undo deploy/mds-ui
```

Then revert the image tag in `environments/$MDS_ENV/main.yml` so the next Ansible run doesn't roll forward again. If a DB migration ran, restore the pre-upgrade dump (§13.3).

### 12.4 Scaling

- Automatic: HPA scales between `mds_*_replicas` and `mds_*_hpa_max` at `mds_hpa_cpu_target`% CPU.
- Manual: change `mds_api_replicas` / `mds_api_hpa_max`, then re-run `03`.
- Add a worker: add the host under `[k3s_agents]` (or raise `agent_count` in Terraform), then run `00` and `01` with `--limit <newhost>,k3s_server,kube_control`.

### 12.5 Rotate secrets

1. `ansible-vault edit environments/$MDS_ENV/vault.yml` (rotate each environment separately)
2. **PostgreSQL**: the password is baked into the data dir on first init, so change it in the DB first:
   `kubectl -n $MDS_ENV exec -it mds-postgres-0 -- psql -U postgres -c "ALTER USER postgres PASSWORD 'NEW';"`
3. **MinIO**: root credentials come from the environment, so changing the secret and restarting is enough.
4. Run `ansible-playbook playbooks/03-deploy-mds.yml -e mds_env=$MDS_ENV`, then `kubectl -n $MDS_ENV rollout restart sts/mds-minio deploy/mds-api`.

### 12.6 Resize volumes

`local-path` volumes cannot be expanded. Restore into a bigger PVC instead, or use an expandable storage class (EBS gp3 / Longhorn). In that case, edit the PVC `spec.resources.requests.storage`.

### 12.7 Cluster upgrades (k3s)

Bump `k3s_version`. On each node (server first, then agents, one at a time), drain with `kubectl drain <node> --ignore-daemonsets --delete-emptydir-data`, remove `/usr/local/bin/k3s`, run `01-k8s-cluster.yml --limit <node>`, then `kubectl uncordon <node>`. Take a backup first.

---

## 13. Backup and disaster recovery

### 13.1 What is backed up

| Data | How | Where | Retention |
|---|---|---|---|
| PostgreSQL `master_data` (all catalogs, versions, workflow state) | `pg_dump -Fc`, verified with `pg_restore --list` | PVC `mds-backups:/postgres/` (+ S3 if enabled) | `mds_backup_retention_days` (14) |
| MinIO `openg2p-geo` (GeoJSON boundaries) | `mc mirror` | PVC `mds-backups:/minio/` (+ S3 if enabled) | latest mirror |
| Config | Git (this repo) + ansible-vault | VCS | — |

The schedule is `mds_backup_schedule` (daily 01:00 UTC). **For production, enable `mds_backup_remote_enabled`.** The backup PVC sits on the same node as the data, so on its own it does not protect against losing that node.

### 13.2 Run and inspect backups

```bash
ansible-playbook playbooks/backup.yml -e mds_env=$MDS_ENV                # trigger CronJob now + download a dump to artifacts/backups/<env>/
kubectl -n $MDS_ENV get cronjob,jobs
kubectl -n $MDS_ENV logs job/<job-name> --all-containers
```

### 13.3 Restore PostgreSQL

```bash
ansible-playbook playbooks/restore.yml -e mds_env=$MDS_ENV \
  -e backup_file=artifacts/backups/$MDS_ENV/mds_backup_20261014-010000.dump -e confirm=RESTORE
```

The playbook validates the archive, scales the API to 0, runs `pg_restore --clean --if-exists`, scales the API back up and waits for the rollout.

### 13.4 Restore MinIO boundaries

```bash
kubectl -n $MDS_ENV run mc-restore --rm -it --restart=Never --image=minio/mc \
  --labels=app.kubernetes.io/name=mds-backup \
  --overrides='{"spec":{"volumes":[{"name":"b","persistentVolumeClaim":{"claimName":"mds-backups"}}],"containers":[{"name":"mc-restore","image":"minio/mc","stdin":true,"tty":true,"command":["/bin/sh"],"volumeMounts":[{"name":"b","mountPath":"/backups"}]}]}}'
# inside the pod:
mc alias set local http://mds-minio:9000 <MINIO_ROOT_USER> <MINIO_ROOT_PASSWORD>
mc mirror --overwrite /backups/minio/openg2p-geo local/openg2p-geo
```

(With remote backups enabled, you can mirror from `remote/<bucket>/<env>/minio/openg2p-geo` instead.)

### 13.5 Full disaster recovery (cluster lost)

| Step | Action | Target time |
|---|---|---|
| 1 | `terraform apply` (new nodes) | 5 min |
| 2 | `ansible-playbook playbooks/site.yml -e verify_external=false` | 15–20 min |
| 3 | Fetch each environment's latest dump from S3 (`<bucket>/develop/…`, `<bucket>/staging/…`) into `artifacts/backups/<env>/`. Steps 4–5 run once per environment | 2 min |
| 4 | `restore.yml` with that dump | 5 min |
| 5 | Restore MinIO (§13.4, from remote) | 5 min |
| 6 | Update DNS if the IP changed, then run `verify.yml` | 5 min |

**RPO** is up to 24 h (daily schedule; increase the frequency if needed). **RTO** is about 45 min. Test the full restore into a staging environment **every quarter**.

---

## 14. Switching to Keycloak / IAM (Option B)

> Keycloak **without** the OpenG2P IAM staff-portal is already supported and is what the MDS-dev-staging server runs: `mds_standalone_mode: true` + `mds_keycloak_enabled: true` and playbook `05-keycloak.yml` (see "Login: Keycloak" above). The steps below are for a full OpenG2P IAM.

In `main.yml`:

```yaml
mds_standalone_mode: false
mds_iam_url: https://iam.example.gov
mds_login_provider_id: "1"
mds_cookie_domain: .example.gov
mds_keycloak_client_id: iam-staff-portal
```

Make these changes in `environments/<env>/main.yml` to switch one environment at a time. For example, move develop to Keycloak first while staging stays standalone. In `environments/<env>/vault.yml`, set `vault_keycloak_client_secret`. Check the exact client-secret variable name the API expects against the compose file, and add extra env through `mds_api_extra_env` if needed.

Then run `03-deploy-mds.yml`. The result:

- `MASTER_DATA_API_AUTH_ENABLED=true`
- `COMMON_AUTH_PROVIDER_API_URL` / `MASTER_DATA_API_AUTH_PROVIDER_API_URL` point at the IAM
- The UI's `IAM_URL` points at the real IAM
- The mock-iam sidecar is removed, and `patch_api.py` / `patch_ui.js` are no longer run

In Keycloak, register `https://<ui-host>/*` as a valid redirect URI and `https://<ui-host>` as a web origin. Then **remove `mds_ingress_basic_auth_enabled`**; it is no longer needed and gets in the way of SSO redirects.

---

## 15. Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Browser shows **508 Loop Detected** / bounces `/en` ↔ `/api/login` | `patch_ui.js` didn't run or mock IAM is down | `kubectl -n $MDS_ENV logs deploy/mds-ui -c ui \| grep standalone`. Check `mds_ui_start_command` is set, hooks exist in the ConfigMap (`kubectl -n $MDS_ENV get cm mds-hooks -o yaml`), and the `mock-iam` container is Ready |
| `/api/login` or `/api/me` returns **500** | UI can't reach IAM at `localhost:8020` | `kubectl -n $MDS_ENV logs deploy/mds-ui -c mock-iam`, and check `IAM_URL=http://localhost:8020` in `cm/mds-ui-config` |
| API returns **401** with auth disabled | `patch_api.py` not applied | `kubectl -n $MDS_ENV logs deploy/mds-api \| grep patch_api`, and check `mds_api_start_command` and `MASTER_DATA_API_AUTH_ENABLED=false` |
| API `CrashLoopBackOff`, DB connection error | Wrong DB env names | Compare `kubectl -n $MDS_ENV exec deploy/mds-api -- env \| sort` with compose. Fix `mds_api_db_env_names` |
| Pod stuck `Init:0/2` | Postgres/MinIO not ready | `kubectl -n $MDS_ENV get pods`, then `kubectl -n $MDS_ENV logs mds-postgres-0` |
| `ImagePullBackOff` | Private registry / wrong tag | Set `mds_image_pull_secret` + `vault_registry_*`, and check the tag |
| PVC `Pending` | Storage class missing | `kubectl get sc`, then set `mds_storage_class` |
| Certificate not Ready | DNS not pointing at ingress / port 80 blocked / rate limit | `kubectl -n $MDS_ENV describe challenge`. Use `letsencrypt-staging` while testing |
| `403` from ingress | IP not in `mds_ingress_allowlist_cidrs` | Add the CIDR. `externalTrafficPolicy: Local` keeps real client IPs |
| UI ↔ API calls time out | NetworkPolicy | `kubectl -n $MDS_ENV get netpol`. The UI must have label `app.kubernetes.io/name=mds-ui` |
| Ansible fails `kubernetes.core` import | venv not built | Re-run `01-k8s-cluster.yml` (role `kube_tools`) |
| Ansible ignores `ansible.cfg` (WSL) | world-writable dir | `export ANSIBLE_CONFIG=$PWD/ansible.cfg` or move the repo into `~` |
| Backup job fails | Disk full / creds | `kubectl -n $MDS_ENV logs job/<job> --all-containers`, and `kubectl -n $MDS_ENV exec mds-postgres-0 -- df -h` |

Diagnostics bundle for escalation:

```bash
kubectl -n $MDS_ENV get all,ingress,pvc,netpol,cm,certificate -o wide > mds-diag-$MDS_ENV.txt
kubectl -n $MDS_ENV describe pods >> mds-diag-$MDS_ENV.txt
kubectl -n $MDS_ENV logs deploy/mds-api --tail=500 >> mds-diag-$MDS_ENV.txt
kubectl -n $MDS_ENV logs deploy/mds-ui --all-containers --tail=500 >> mds-diag-$MDS_ENV.txt
kubectl get events -n $MDS_ENV --sort-by=.lastTimestamp >> mds-diag-$MDS_ENV.txt
```

---

## 16. Security notes

- **Standalone mode = no authentication.** Every visitor is Admin with full maker-checker and publish rights. Never expose it to the open Internet without **`mds_ingress_allowlist_cidrs`** and/or **`mds_ingress_basic_auth_enabled`**, or a VPN. Maker-checker separation is not enforced by identity in this mode. Use Option B for real four-eyes governance.
- PostgreSQL and MinIO are never exposed outside the cluster (no ingress, no NodePort, plus NetworkPolicies).
- Secrets live in ansible-vault and in Kubernetes Secrets. k3s runs with `--secrets-encryption`, so Secrets are encrypted at rest in etcd/sqlite.
- EBS volumes are encrypted, IMDSv2 is enforced, and SSH and the K8s API are restricted to `admin_cidrs`.
- Change every README default (`minioadmin/minioadmin`, `postgres/password`). Production preflight enforces this.
- Pin image tags (no `latest`) and scan them (`trivy image <img>`) before upgrades.

---

## 17. Go-live checklist

- [ ] §3 inputs collected: images, start commands, env names, hooks, seed scripts
- [ ] Terraform applied; `admin_cidrs` restricted; `terraform.tfstate` stored remotely
- [ ] `environments/develop/vault.yml` and `environments/staging/vault.yml` encrypted, with strong passwords that differ between environments
- [ ] Namespaces `develop` and `staging` exist (`kubectl get ns develop staging`) and both pass `verify.yml`
- [ ] Four DNS records (UI + API × 2 environments) resolve to the ingress
- [ ] All nodes `Ready`; ingress-nginx and cert-manager healthy
- [ ] DNS A records created; certificates `Ready` from `letsencrypt-prod` (or corporate CA)
- [ ] Access restriction configured (allowlist / basic auth / VPN), or Option B IAM enabled
- [ ] `verify.yml` all green, including external checks
- [ ] Catalogs seeded and counts match §10
- [ ] Maker-checker flow tested end to end (draft → submit → compare → approve → publish)
- [ ] Backup CronJob ran successfully; **remote S3 copy enabled**; restore tested in staging
- [ ] Monitoring/alerting on `/ping`, pod restarts, PVC usage, and backup job failures
- [ ] This runbook's hostnames, contacts and escalation path filled in for your organisation

---

## 18. Teardown

Remove **one environment**. The other namespace is untouched:

```bash
ansible-playbook playbooks/backup.yml   -e mds_env=develop                      # always back up first
ansible-playbook playbooks/teardown.yml -e mds_env=develop -e confirm=DELETE-MDS # deletes namespace "develop" + its volumes
```

Remove **everything**:

```bash
ansible-playbook playbooks/teardown.yml -e mds_env=develop -e confirm=DELETE-MDS
ansible-playbook playbooks/teardown.yml -e mds_env=staging -e confirm=DELETE-MDS -e uninstall_k3s=true   # also removes k3s
cd infra/terraform/aws && terraform destroy                                                              # removes AWS resources
```

To bring a removed environment back, run `03-deploy-mds.yml` for it, then `restore.yml` (or re-seed).

---

## 19. Pointing the Gen2 dev environment (far / live / crop) at this MDS

The dev registries run on the Gen2 RKE2 cluster. Today they call the in-cluster MDS from `commons-services`, for example `MASTERDATA_BACKEND_API_URL=http://commons-services-master-data-api` on `farmer-registry` in namespace `far`. Cutting over means changing that URL to this standalone MDS's API host. Do it one namespace at a time, and keep the old value so you can roll back.

### 19.1 Before the cutover

| Check | How |
|---|---|
| This MDS is seeded and healthy | `verify.yml` green, counts match §10 |
| Catalogue codes match what the registries query | Compare dataset codes in `https://<api-host>/docs` with the current MDS (`kubectl -n far exec deploy/<registry> -- curl -s http://commons-services-master-data-api/...`). Registry dropdowns break if a code is missing |
| Region / network | Same region as dev (`ap-south-1`). VPC CIDRs must not overlap if you plan VPC peering |

### 19.2 Network: let the dev pods reach the API

Registry backends call MDS **server-side**, so the request comes from the dev cluster's egress IP, not from the user's browser.

```bash
# On the dev cluster: find the egress IP(s) of the registry pods
kubectl -n far run egress-check --rm -it --restart=Never --image=curlimages/curl -- curl -s https://ifconfig.me
```

Add those IPs (as `/32`) to:

- `public_ingress_cidrs` in `terraform.tfvars` (security group), then `terraform apply`
- `mds_ingress_allowlist_cidrs` in `environments/<env>/main.yml` (ingress allowlist), then re-run `03-deploy-mds.yml`

Do **not** enable `mds_ingress_basic_auth_enabled` on an environment the registries use. They don't send basic-auth credentials.

Alternative: VPC peering between the dev VPC and this VPC, with the API reached on private IPs. This is more work, but nothing is exposed publicly.

### 19.3 TLS: the registries must trust the API certificate

- **Recommended:** a public DNS name for the API (e.g. `mds-api-dev.<your-public-domain>`) with `letsencrypt-prod`. Every container trusts it with no changes.
- If you use a private `*.openg2p.test` name instead, issue the cert from the same private CA the dev cluster uses (`/openg2p-ca/ca.crt`), and add DNS for it on the dev cluster (CoreDNS). Node services trust it through `NODE_EXTRA_CA_CERTS`. Python services may need `SSL_CERT_FILE`/`REQUESTS_CA_BUNDLE` set, too.

Test from inside the dev cluster:

```bash
kubectl -n far run mds-check --rm -it --restart=Never --image=curlimages/curl -- \
  curl -fsS https://<api-host>/ping
```

### 19.4 Switch the registries

Find every workload that has the MDS URL:

```bash
for ns in far live crop; do
  kubectl -n $ns get deploy -o json | jq -r --arg ns "$ns" '.items[]
    | . as $d | .spec.template.spec.containers[] | .env[]?
    | select(.name | test("MASTER_?DATA"; "i"))
    | "\($ns)  \($d.metadata.name)  \(.name)=\(.value)"'
done
```

Change the value in the **Helm values** of each registry release (Rancher → Apps → the release → Edit/Upgrade, or `helm upgrade ... --reuse-values --set ...`). A `kubectl set env` works for a quick test, but the next Helm upgrade reverts it.

```bash
# quick test only (reverted by the next helm upgrade):
kubectl -n far set env deploy/<registry-deploy> MASTERDATA_BACKEND_API_URL=https://<api-host>
kubectl -n far rollout status deploy/<registry-deploy>
```

Then, in the registry UI, open a create/edit form and confirm the dropdowns (crops, livestock, geography) load.

**Rollback:** set the variable back to `http://commons-services-master-data-api` and roll out again.

### 19.5 Auth

**With Keycloak login (`mds_keycloak_enabled: true`, the current setup) every API call needs a Keycloak access token of the environment's realm with `azp=master-data`, so a registry calling the API without one gets 401.** Before cutting a registry over, either give it a token from that realm (e.g. a service-account client whose tokens are issued to `master-data`), or keep that environment on `mds_keycloak_enabled: false`.

In standalone mode without Keycloak (`mds_standalone_mode: true`, `mds_keycloak_enabled: false`), the API doesn't check tokens. The registries work whether or not they send a bearer token, and the IP allowlist is the only protection. For a shared or long-lived setup, move this MDS to the dev Keycloak (§14, Option B). Point `mds_iam_url` at the dev IAM, and register the MDS client in that realm.
