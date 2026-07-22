BEGIN;

INSERT INTO departments (id, code, name) VALUES
  ('10000000-0000-4000-8000-000000000001', 'LBL', 'Labeling & Compliance');

INSERT INTO users (id, email, display_name, external_subject) VALUES
  ('20000000-0000-4000-8000-000000000001', 'admin@example.invalid', 'Usuario Administrador', 'demo-admin'),
  ('20000000-0000-4000-8000-000000000002', 'owner@example.invalid', 'Process Owner', 'demo-owner'),
  ('20000000-0000-4000-8000-000000000003', 'specialist@example.invalid', 'Labeling Specialist', 'demo-specialist'),
  ('20000000-0000-4000-8000-000000000004', 'reviewer@example.invalid', 'Reviewer', 'demo-reviewer');

INSERT INTO roles (id, code, name) VALUES
  ('30000000-0000-4000-8000-000000000001', 'SYSTEM_ADMIN', 'Administrador general'),
  ('30000000-0000-4000-8000-000000000002', 'PROCESS_OWNER', 'Propietario de proceso'),
  ('30000000-0000-4000-8000-000000000003', 'EDITOR', 'Editor'),
  ('30000000-0000-4000-8000-000000000004', 'REVIEWER', 'Revisor');

INSERT INTO node_types (id, code, name, color, icon, is_system) VALUES
  ('40000000-0000-4000-8000-000000000001', 'PROCESS', 'Proceso', '#4C88B7', 'workflow', true),
  ('40000000-0000-4000-8000-000000000002', 'ACTIVITY', 'Actividad', '#DB9A42', 'square-check', true),
  ('40000000-0000-4000-8000-000000000003', 'SYSTEM', 'Sistema', '#7B72B5', 'server', true),
  ('40000000-0000-4000-8000-000000000004', 'MANUAL', 'Manual', '#B76D79', 'book-open', true),
  ('40000000-0000-4000-8000-000000000005', 'CONTROL', 'Control', '#4E967A', 'shield-check', true);

INSERT INTO relationship_types (id, code, name, inverse_name) VALUES
  ('50000000-0000-4000-8000-000000000001', 'USES', 'Usa', 'Es usado por'),
  ('50000000-0000-4000-8000-000000000002', 'CONSULTS', 'Consulta', 'Es consultado por'),
  ('50000000-0000-4000-8000-000000000003', 'NEXT', 'Se ejecuta antes de', 'Se ejecuta después de'),
  ('50000000-0000-4000-8000-000000000004', 'HAS_MANUAL', 'Tiene manual', 'Es manual de');

COMMIT;
