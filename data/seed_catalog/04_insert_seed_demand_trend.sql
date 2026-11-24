-- seed_demand_trend
-- Source: https://ethioseed.moa.gov.et/api/demand-summary/
-- Records: 5

INSERT INTO "seed_demand_trend" ("budget_year", "seed_class", "quantity_demanded") VALUES
  (2017, 'Basic', 180148),
  (2017, 'Breeder', 50),
  (2017, 'Certified (C1)', 3552308),
  (2018, 'Basic', 4),
  (2018, 'Certified (C1)', 3114536);
