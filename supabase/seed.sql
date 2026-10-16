-- Demo organisations, sites and locations (same data as the offline mock).
insert into public.organizations (id, name, organization_number, address) values
  ('11111111-1111-4111-8111-111111111111', 'Volvo Personvagnar AB', '556074-3089', 'Torslandavägen, 405 31 Göteborg'),
  ('22222222-2222-4222-8222-222222222222', 'Nordic Siteworks AB', '559123-4418', 'Kvillebäcksvägen, 417 05 Göteborg'),
  ('33333333-3333-4333-8333-333333333333', 'Sydkomponent AB', '556887-2201', 'Kalkbrottsgatan 12, 212 25 Malmö')
on conflict (id) do nothing;

insert into public.sites (id, organization_id, name, city, address) values
  ('aaaaaaaa-0001-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Volvo Torslanda Plant', 'Gothenburg', 'Torslandavägen, 405 31 Göteborg'),
  ('aaaaaaaa-0002-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Kvillebäcken Construction Site', 'Gothenburg', 'Kvillebäcksvägen, 417 05 Göteborg'),
  ('aaaaaaaa-0003-4000-8000-000000000003', '33333333-3333-4333-8333-333333333333', 'Malmö Component Works', 'Malmö', 'Kalkbrottsgatan 12, 212 25 Malmö')
on conflict (id) do nothing;

insert into public.site_locations (id, site_id, name, sort_order) values
  ('bbbbbbbb-0001-4000-8000-000000000001', 'aaaaaaaa-0001-4000-8000-000000000001', 'Factory Line B', 0),
  ('bbbbbbbb-0001-4000-8000-000000000002', 'aaaaaaaa-0001-4000-8000-000000000001', 'Paint Shop', 1),
  ('bbbbbbbb-0001-4000-8000-000000000003', 'aaaaaaaa-0001-4000-8000-000000000001', 'Loading Bay A', 2),
  ('bbbbbbbb-0001-4000-8000-000000000004', 'aaaaaaaa-0001-4000-8000-000000000001', 'Press Hall', 3),
  ('bbbbbbbb-0002-4000-8000-000000000001', 'aaaaaaaa-0002-4000-8000-000000000002', 'Zone 3 Scaffolding', 0),
  ('bbbbbbbb-0002-4000-8000-000000000002', 'aaaaaaaa-0002-4000-8000-000000000002', 'Roof Level 4', 1),
  ('bbbbbbbb-0002-4000-8000-000000000003', 'aaaaaaaa-0002-4000-8000-000000000002', 'Ground Works', 2),
  ('bbbbbbbb-0002-4000-8000-000000000004', 'aaaaaaaa-0002-4000-8000-000000000002', 'Site Cabin / Welfare', 3),
  ('bbbbbbbb-0003-4000-8000-000000000001', 'aaaaaaaa-0003-4000-8000-000000000003', 'Assembly Cell 2', 0),
  ('bbbbbbbb-0003-4000-8000-000000000002', 'aaaaaaaa-0003-4000-8000-000000000003', 'Chemical Store', 1),
  ('bbbbbbbb-0003-4000-8000-000000000003', 'aaaaaaaa-0003-4000-8000-000000000003', 'Electrical Substation', 2),
  ('bbbbbbbb-0003-4000-8000-000000000004', 'aaaaaaaa-0003-4000-8000-000000000003', 'Packing Hall', 3)
on conflict (id) do nothing;
