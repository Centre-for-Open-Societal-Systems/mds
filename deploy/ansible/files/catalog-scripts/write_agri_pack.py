#!/usr/bin/env python3
"""Turn the output of agri_catalogs_to_pack.sql into a Master Data country pack.

    python3 write_agri_pack.py lists.tsv OUT_DIR

Each input line is "<domain>/<file>.json<TAB><list json>". Writes OUT_DIR/domains/...,
plus the empty levels.json / values.json and the manifest.json the MDS loader
(load_geo_pack.py) requires. Fails on duplicate value ids/codes within a list.
"""

import collections
import json
import os
import sys

MANIFEST = {
    "country": "ETH",
    "synthetic": False,
    "source": "OAN catalogue seed data (oan_catalog_master_data_management/scripts/seed_db_sql)",
    "source_title": "Ethiopia agriculture reference catalogs (crops, livestock, seeds)",
    "license": "See source datasets (EthioSeed MoA, National Livestock Data Standard, ET-LITS)",
    "version": "oan-catalogue-seed",
}


def main(tsv, out):
    bad = []
    for line in open(tsv, encoding="utf-8"):
        line = line.rstrip("\n")
        if not line:
            continue
        path, raw = line.split("\t", 1)
        doc = json.loads(raw)
        values = doc.get("values") or []
        for key in ("value_id", "value_code"):
            seen = collections.Counter(v.get(key) or v["value_id"] for v in values)
            dups = [k for k, n in seen.items() if n > 1]
            if dups:
                bad.append(f"{path}: duplicate {key} {dups[:5]}")
        target = os.path.join(out, "domains", path)
        os.makedirs(os.path.dirname(target), exist_ok=True)
        with open(target, "w", encoding="utf-8") as fh:
            json.dump(doc, fh, ensure_ascii=False, indent=1)
        print(f"{path:45} {doc['attribute_id']:26} {len(values):5}")
    for name, data in (("levels.json", []), ("values.json", []), ("manifest.json", MANIFEST)):
        with open(os.path.join(out, name), "w", encoding="utf-8") as fh:
            json.dump(data, fh, indent=1)
    if bad:
        sys.exit("\n".join(bad))


if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2])
