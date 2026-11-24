-- livestock_catalog
-- Sources: https://lis.moa.gov.et/api/superset-proxy/categories/species?dvzProxyDatasetId=61
--          https://etlits.moa.gov.et livestock registry (species facet)
--          National Livestock Data Standard, Tables 4 and 9
-- Records: 5

INSERT INTO "livestock_catalog" ("species_code", "name", "description", "icon_url", "dataset_id", "scientific_name", "subfamily", "species_type_code", "chart_color", "ear_tag_range", "in_lis_population", "in_etlits_registry") VALUES
  ('Beehive', 'Beehive', 'Managed honey bee colony unit registered in ET-LITS. Bees are listed as a domestic animal species in the National Livestock Data Standard but are not tracked on the LIS population dashboard.', NULL, NULL, 'Anthophila', 'Apinae', NULL, NULL, NULL, FALSE, TRUE),
  ('Camel', 'Camel', 'Arid-zone livestock species tracked in Ethiopia''s national population dashboard.', 'https://lis.moa.gov.et/wp/wp-content/uploads/2025/05/camel-population.svg', 61, 'Camelus', 'Camelidae', 4, '#EA901C', 'ET 7500000000-ET 7599999999', TRUE, TRUE),
  ('Cattle', 'Cattle', 'A vital livestock species in Ethiopia, including zebu cattle known for resilience to harsh climates and a crucial role in agriculture and livelihoods.', 'https://lis.moa.gov.et/wp/wp-content/uploads/2025/05/cattle-population.svg', 61, 'Bos taurus & Bos indicus', 'Bovine', 1, '#484848', 'ET 0000000000-ET 4999999999', TRUE, TRUE),
  ('Goat', 'Goat', 'Major small ruminant livestock species tracked in Ethiopia''s national population dashboard.', 'https://lis.moa.gov.et/wp/wp-content/uploads/2025/05/goat-population.svg', 61, 'Capra hircus', 'Caprine', 2, '#FACE58', 'ET 6000000000-ET 7499999999', TRUE, TRUE),
  ('Sheep', 'Sheep', 'Major small ruminant livestock species tracked in Ethiopia''s national population dashboard.', 'https://lis.moa.gov.et/wp/wp-content/uploads/2025/05/sheep-population.svg', 61, 'Ovis aries', 'Ovine', 3, '#BA4747', 'ET 5000000000-ET 5999999999', TRUE, TRUE);
