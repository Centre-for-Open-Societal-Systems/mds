-- seed_demand_trend_by_crop
-- Source: https://ethioseed.moa.gov.et/seed-demand-trend-by-class/{seed_id}/
-- Records: 18

INSERT INTO "seed_demand_trend_by_crop" ("crop_id", "crop_name", "budget_year", "seed_class", "quantity_demanded") VALUES
  (1, 'Maize ( Zea mays L.)', 2017, 'Basic', 104691),
  (1, 'Maize ( Zea mays L.)', 2017, 'Certified (C1)', 1340557),
  (1, 'Maize ( Zea mays L.)', 2018, 'Basic', 0),
  (1, 'Maize ( Zea mays L.)', 2018, 'Certified (C1)', 1190811),
  (2, 'Bread wheat (Triticum aestivum L.)', 2017, 'Basic', 2607),
  (2, 'Bread wheat (Triticum aestivum L.)', 2017, 'Certified (C1)', 1118480),
  (2, 'Bread wheat (Triticum aestivum L.)', 2018, 'Basic', 4),
  (2, 'Bread wheat (Triticum aestivum L.)', 2018, 'Certified (C1)', 1224744),
  (6, 'Tef ( Eragrostis tef)', 2017, 'Certified (C1)', 118478),
  (6, 'Tef ( Eragrostis tef)', 2018, 'Certified (C1)', 73964),
  (7, 'Sorghum (Sorghum bicolor)', 2017, 'Basic', 12756),
  (7, 'Sorghum (Sorghum bicolor)', 2017, 'Certified (C1)', 87927),
  (7, 'Sorghum (Sorghum bicolor)', 2018, 'Basic', 0),
  (7, 'Sorghum (Sorghum bicolor)', 2018, 'Certified (C1)', 29369),
  (33, 'Sesame', 2017, 'Basic', 2163),
  (33, 'Sesame', 2017, 'Certified (C1)', 128001),
  (33, 'Sesame', 2018, 'Basic', 0),
  (33, 'Sesame', 2018, 'Certified (C1)', 11875);
