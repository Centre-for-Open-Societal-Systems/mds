-- livestock_gender, livestock_location_type, livestock_body_condition,
-- livestock_production_type, livestock_production_type_species, livestock_record_status
-- Sources: National Livestock Data Standard (gender, body condition score, production purpose)
--          https://etlits.moa.gov.et livestock registry (locationType, productionType, status values)
-- Records: 65

INSERT INTO "livestock_gender" ("code", "name", "description", "in_etlits_registry") VALUES
  ('Female', 'Female', 'An individual of the sex that has ovaries and produces ova.', TRUE),
  ('FemaleNeuter', 'Female neuter', 'Female animal whose reproductive organs have been removed so that it cannot reproduce.', FALSE),
  ('Male', 'Male', 'An individual of the gamete-producing sex that fertilises the female.', TRUE),
  ('MaleNeuter', 'Male neuter', 'Male animal whose testicles have been rendered dysfunctional through an approved procedure.', FALSE);

INSERT INTO "livestock_location_type" ("code", "name", "ethiopian_zone_name", "altitude_description", "crop_catalog_ecological_zone_id", "description") VALUES
  ('High Land', 'High land', 'Dega', 'Highland zone, typically above 2,300 m', 3, 'Cool highland grazing areas.'),
  ('Low Land', 'Low land', 'Kolla', 'Lowland zone, typically below 1,500 m', 1, 'Hot lowland and pastoral grazing areas.'),
  ('Mid Land', 'Mid land', 'Weyna Dega', 'Mid-altitude zone, typically 1,500-2,300 m', 2, 'Mid-altitude mixed crop and livestock areas.');

INSERT INTO "livestock_body_condition" ("code", "bcs_score", "condition_label", "fatness_label", "etlits_label", "description") VALUES
  ('BCS1', 1, 'Poor', 'Very Thin', NULL, 'Spinous and transverse processes prominent and sharp, no fat cover over the eye muscle.'),
  ('BCS2', 2, 'Fair', 'Thin', 'Thin', 'Spinous process prominent but smooth, eye muscle area of moderate depth with little fat cover.'),
  ('BCS3', 3, 'Good', 'Moderate', 'Moderate Weight', 'Spinous process a small smooth elevation, eye muscle area full with a moderate degree of fat cover.'),
  ('BCS4', 4, 'Very Good', 'Fat', 'Fat', 'Spinous processes detected only under pressure, eye muscle area full with a thick fat covering.'),
  ('BCS5', 5, 'Excellent', 'Very Fat', NULL, 'Transverse process ends cannot be felt, eye muscle area full with a very thick fat covering.');

INSERT INTO "livestock_production_type" ("code", "name", "standard_purpose", "in_national_standard", "in_etlits_registry", "description") VALUES
  ('Breeding', 'Breeding', NULL, FALSE, TRUE, 'Animal kept to produce offspring.'),
  ('Castrated', 'Castrated', NULL, FALSE, TRUE, 'Recorded by ET-LITS as a production type; the national standard treats neutering as a sex enumerator (MaleNeuter) rather than a production purpose.'),
  ('Draft Power', 'Draft power', 'Draft power', TRUE, FALSE, 'Animal used to draw ploughs or carts.'),
  ('Dual Purpose', 'Dual purpose', NULL, FALSE, TRUE, 'Animal kept for two purposes, typically milk and meat.'),
  ('Dung', 'Dung', 'Dung', TRUE, FALSE, 'Animal kept partly for dung used as fuel or fertiliser.'),
  ('Egg', 'Egg', NULL, FALSE, TRUE, 'Poultry kept for egg production; no catalogued species carries this purpose.'),
  ('Hide/Skin', 'Hide or skin', 'Hide/Skin', TRUE, FALSE, 'Animal kept for hides and skins.'),
  ('Honey', 'Honey', NULL, FALSE, TRUE, 'Bee colony kept for honey production.'),
  ('Meat', 'Meat', 'Meat', TRUE, TRUE, 'Animal kept for meat production.'),
  ('Milk', 'Milk', 'Milk', TRUE, TRUE, 'Animal kept for milk production.'),
  ('Other (social status)', 'Other (social status)', 'Other (social status)', TRUE, FALSE, 'Animal kept for social or cultural value.'),
  ('Pack Animal', 'Pack animal', 'Draft power', FALSE, TRUE, 'ET-LITS label for animals used to carry loads; equivalent to the standard draft power purpose.'),
  ('Wool', 'Wool', 'Wool', TRUE, FALSE, 'Sheep kept for wool production.');

INSERT INTO "livestock_production_type_species" ("production_type_code", "species_code") VALUES
  ('Breeding', 'Camel'),
  ('Breeding', 'Cattle'),
  ('Breeding', 'Goat'),
  ('Breeding', 'Sheep'),
  ('Castrated', 'Camel'),
  ('Castrated', 'Cattle'),
  ('Castrated', 'Goat'),
  ('Castrated', 'Sheep'),
  ('Draft Power', 'Camel'),
  ('Draft Power', 'Cattle'),
  ('Dual Purpose', 'Camel'),
  ('Dual Purpose', 'Cattle'),
  ('Dual Purpose', 'Goat'),
  ('Dual Purpose', 'Sheep'),
  ('Dung', 'Camel'),
  ('Dung', 'Cattle'),
  ('Hide/Skin', 'Cattle'),
  ('Hide/Skin', 'Goat'),
  ('Hide/Skin', 'Sheep'),
  ('Honey', 'Beehive'),
  ('Meat', 'Camel'),
  ('Meat', 'Cattle'),
  ('Meat', 'Goat'),
  ('Meat', 'Sheep'),
  ('Milk', 'Camel'),
  ('Milk', 'Cattle'),
  ('Milk', 'Goat'),
  ('Other (social status)', 'Camel'),
  ('Other (social status)', 'Cattle'),
  ('Other (social status)', 'Goat'),
  ('Other (social status)', 'Sheep'),
  ('Pack Animal', 'Camel'),
  ('Pack Animal', 'Cattle'),
  ('Wool', 'Sheep');

INSERT INTO "livestock_record_status" ("code", "name", "sort_order", "is_live_master_data", "description") VALUES
  ('PENDING', 'Pending', 1, FALSE, 'Submitted and awaiting review.'),
  ('REWORK', 'Rework', 2, FALSE, 'Returned to the submitter for correction.'),
  ('REJECTED', 'Rejected', 3, FALSE, 'Reviewed and rejected.'),
  ('APPROVED', 'Approved', 4, FALSE, 'Approved by a reviewer but not yet live.'),
  ('ACTIVE', 'Active', 5, TRUE, 'Approved and live in the registry.'),
  ('INACTIVE', 'Inactive', 6, FALSE, 'Previously live and since retired.');
