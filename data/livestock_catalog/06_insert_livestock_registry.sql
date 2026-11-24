-- livestock_registry_entry
-- Source: https://etlits.moa.gov.et livestock registry list API, retrieved 14 August 2026
-- Records: 12

INSERT INTO "livestock_registry_entry" ("id", "species_code", "breed_name", "breed_id", "gender_code", "location_type_code", "body_condition_code", "production_type_code", "status", "created_on", "updated_on") VALUES
  ('livestock-008569662215', 'Cattle', 'Boran', 10, 'Female', 'Low Land', 'BCS3', 'Milk', 'ACTIVE', '2026-08-10T11:28:32.902Z', '2026-08-13T07:49:28.294Z'),
  ('livestock-019210037813', 'Camel', 'Boran', 10, 'Female', 'High Land', 'BCS3', 'Meat', 'ACTIVE', '2026-08-13T07:45:05.823Z', '2026-08-13T13:14:19.920Z'),
  ('livestock-198953821362', 'Cattle', 'Gir', 92, 'Female', 'Mid Land', 'BCS4', 'Milk', 'INACTIVE', '2026-08-14T10:49:56.648Z', '2026-08-14T10:57:35.640Z'),
  ('livestock-212708917710', 'Sheep', 'Merino', 77, 'Female', 'High Land', 'BCS2', 'Dual Purpose', 'REJECTED', '2026-08-13T13:07:45.825Z', '2026-08-13T13:15:14.941Z'),
  ('livestock-293287324110', 'Cattle', 'BoranR', NULL, 'Male', 'High Land', 'BCS2', 'Castrated', 'APPROVED', '2026-08-14T11:01:14.745Z', '2026-08-14T11:04:03.489Z'),
  ('livestock-350410916860', 'Beehive', 'Honey Bee', 94, 'Female', 'Mid Land', 'BCS3', 'Honey', 'PENDING', '2026-08-13T11:05:00.816Z', '2026-08-13T11:05:00.816Z'),
  ('livestock-414930215931', 'Goat', 'Boer', 91, 'Female', 'Mid Land', 'BCS3', 'Pack Animal', 'INACTIVE', '2026-08-13T13:19:52.800Z', '2026-08-14T07:40:16.213Z'),
  ('livestock-469557638335', 'Cattle', 'Test', NULL, 'Male', 'High Land', 'BCS4', 'Meat', 'PENDING', '2026-08-13T07:46:14.127Z', '2026-08-13T07:46:14.127Z'),
  ('livestock-479102083675', 'Sheep', 'Dorper', 75, 'Male', 'Mid Land', 'BCS3', 'Breeding', 'PENDING', '2026-08-13T12:42:19.245Z', '2026-08-13T12:42:19.245Z'),
  ('livestock-738602771660', 'Camel', 'Ethiopian Camel', 93, 'Female', 'Mid Land', 'BCS3', 'Pack Animal', 'REWORK', '2026-08-14T08:04:25.847Z', '2026-08-14T08:09:55.398Z'),
  ('livestock-758330957676', 'Goat', 'Boer', 91, 'Female', 'Mid Land', 'BCS3', 'Pack Animal', 'REWORK', '2026-08-13T13:14:52.014Z', '2026-08-13T13:15:50.246Z'),
  ('livestock-918889998727', 'Cattle', 'Holstein Friesian', 26, 'Male', 'Mid Land', 'BCS2', 'Egg', 'REWORK', '2026-08-13T07:56:55.101Z', '2026-08-13T07:59:36.932Z');
