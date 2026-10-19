# Catalog seed scripts

Copy these files here from the original MDS standalone repository:

- `import_all_catalogs.py`: Crops, Livestock and Seeds catalogs
- `add_geography_to_catalogs.py`: Regions (14), Zones (125) and Woredas (1,359)

Then run:

```bash
ansible-playbook playbooks/04-seed-catalogs.yml
```

The playbook copies each script into a running `mds-api` pod and runs it with `python`, in the order listed. This is the Kubernetes version of the `docker cp` / `docker exec` steps in the README.
