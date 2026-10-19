#!/usr/bin/env python3
import requests
import json
import sys

KEYCLOAK_URL = "http://localhost:8080"
REALM = "staff"
CLIENT_MNEMONIC = "farmer-registry-staff-portal"

def get_admin_token():
    res = requests.post(
        f"{KEYCLOAK_URL}/realms/master/protocol/openid-connect/token",
        data={
            "client_id": "admin-cli",
            "username": "admin",
            "password": "admin",
            "grant_type": "password"
        }
    )
    if res.status_code != 200:
        print("Failed to get admin token:", res.text)
        sys.exit(1)
    return res.json()["access_token"]

def run():
    token = get_admin_token()
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json"
    }

    # 1. Get Client ID for farmer-registry-staff-portal
    res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients", headers=headers)
    clients = res.json()
    client_id = None
    for c in clients:
        if c.get("clientId") == CLIENT_MNEMONIC:
            client_id = c["id"]
            break
    if not client_id:
        print(f"Client {CLIENT_MNEMONIC} not found!")
        sys.exit(1)
    print(f"Found client {CLIENT_MNEMONIC} with ID: {client_id}")

    # 2. Get available client roles
    res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/clients/{client_id}/roles", headers=headers)
    roles = {r["name"]: r for r in res.json()}
    print(f"Available client roles: {list(roles.keys())}")

    # 3. Create Organizations / Groups
    orgs = [
        {"name": "Ministry of Agriculture (MoA)", "catalogs": ["Crops", "Seeds", "Inputs"]},
        {"name": "Livestock Development Institute (LDI)", "catalogs": ["Livestock"]},
        {"name": "Central Statistical Agency (CSA)", "catalogs": ["Administrative Geography"]}
    ]

    res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/groups", headers=headers)
    existing_groups = {g["name"]: g["id"] for g in res.json()}

    group_ids = {}
    for org in orgs:
        name = org["name"]
        if name in existing_groups:
            print(f"Group '{name}' already exists.")
            group_ids[name] = existing_groups[name]
        else:
            create_res = requests.post(
                f"{KEYCLOAK_URL}/admin/realms/{REALM}/groups",
                headers=headers,
                json={"name": name, "attributes": {"managed_catalogs": [", ".join(org["catalogs"])]}}
            )
            print(f"Created group '{name}': status {create_res.status_code}")
            # get created id
            res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/groups", headers=headers)
            for g in res.json():
                if g["name"] == name:
                    group_ids[name] = g["id"]

    # 4. Create Users for each Organization
    users_to_create = [
        {
            "username": "moa.maker",
            "email": "moa.maker@moa.gov.et",
            "firstName": "Abebe",
            "lastName": "Tadesse",
            "org": "Ministry of Agriculture (MoA)",
            "roles": ["Reference Data Specialist", "Data Editor"],
            "password": "password"
        },
        {
            "username": "moa.checker",
            "email": "moa.checker@moa.gov.et",
            "firstName": "Tigist",
            "lastName": "Alemu",
            "org": "Ministry of Agriculture (MoA)",
            "roles": ["Data Supervisor", "Technical Administrator", "Reference Data Specialist"],
            "password": "password"
        },
        {
            "username": "ldi.specialist",
            "email": "ldi.specialist@ldi.gov.et",
            "firstName": "Dawit",
            "lastName": "Bekele",
            "org": "Livestock Development Institute (LDI)",
            "roles": ["Reference Data Specialist", "Technical Administrator"],
            "password": "password"
        },
        {
            "username": "csa.admin",
            "email": "csa.admin@csa.gov.et",
            "firstName": "Sara",
            "lastName": "Haile",
            "org": "Central Statistical Agency (CSA)",
            "roles": ["Technical Administrator", "Reference Data Specialist"],
            "password": "password"
        }
    ]

    res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/users", headers=headers)
    existing_users = {u["username"]: u["id"] for u in res.json()}

    for u in users_to_create:
        username = u["username"]
        user_id = existing_users.get(username)
        if not user_id:
            payload = {
                "username": username,
                "email": u["email"],
                "firstName": u["firstName"],
                "lastName": u["lastName"],
                "enabled": True,
                "emailVerified": True
            }
            create_u = requests.post(f"{KEYCLOAK_URL}/admin/realms/{REALM}/users", headers=headers, json=payload)
            print(f"User {username} creation status: {create_u.status_code}")
            if create_u.status_code not in (201, 204):
                print(f"Error creating {username}: {create_u.text}")
            # re-fetch user id
            res = requests.get(f"{KEYCLOAK_URL}/admin/realms/{REALM}/users?username={username}", headers=headers)
            user_id = res.json()[0]["id"]
        else:
            print(f"User {username} already exists with ID: {user_id}")

        # Set password
        pw_res = requests.put(
            f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user_id}/reset-password",
            headers=headers,
            json={"type": "password", "value": u["password"], "temporary": False}
        )
        print(f"Set password for {username}: status {pw_res.status_code}")

        # Add to Group
        org_name = u["org"]
        if org_name in group_ids:
            gid = group_ids[org_name]
            add_grp = requests.put(f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user_id}/groups/{gid}", headers=headers)
            print(f"Added {username} to group '{org_name}': {add_grp.status_code}")

        # Assign Client Roles
        assigned_roles = [roles[r_name] for r_name in u["roles"] if r_name in roles]
        if assigned_roles:
            add_role = requests.post(
                f"{KEYCLOAK_URL}/admin/realms/{REALM}/users/{user_id}/role-mappings/clients/{client_id}",
                headers=headers,
                json=assigned_roles
            )
            print(f"Assigned roles to {username}: {add_role.status_code} ({u['roles']})")

    print("\n--- Keycloak Organizations and Users Setup Complete! ---")

if __name__ == "__main__":
    run()
