import re

def parse_inserts(filepath, table_name):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Match INSERT INTO "table" (cols) VALUES ...
    pattern = rf'INSERT INTO "{table_name}"\s*\((.*?)\)\s*VALUES\s*(.*?);'
    match = re.search(pattern, content, re.DOTALL)
    if not match:
        print(f"No match for {table_name} in {filepath}")
        return [], []
    
    cols = [c.strip().strip('"') for c in match.group(1).split(',')]
    vals_str = match.group(2).strip()
    return cols, vals_str

cols, vals = parse_inserts("/home/user/Downloads/crop_catalog-20261012T093805Z-1-001/crop_catalog/02_insert_crop_category.sql", "crop_category")
print("crop_category cols:", cols)

cols, vals = parse_inserts("/home/user/Downloads/crop_catalog-20261012T093805Z-1-001/crop_catalog/03_insert_ecological_zone.sql", "ecological_zone")
print("ecological_zone cols:", cols)
