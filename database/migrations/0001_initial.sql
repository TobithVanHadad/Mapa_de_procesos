BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE record_status AS ENUM ('DRAFT','IN_REVIEW','CHANGES_REQUESTED','APPROVED','PUBLISHED','ACTIVE','INACTIVE','OBSOLETE','ARCHIVED');
CREATE TYPE permission_scope AS ENUM ('GLOBAL','DEPARTMENT','PROCESS','DOCUMENT');
CREATE TYPE relationship_direction AS ENUM ('DIRECTED','BIDIRECTIONAL');
CREATE TYPE raci_role AS ENUM ('RESPONSIBLE','ACCOUNTABLE','CONSULTED','INFORMED');

CREATE TABLE users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  display_name text NOT NULL,
  external_subject text UNIQUE,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  resource text NOT NULL,
  action text NOT NULL,
  description text,
  UNIQUE (resource, action)
);

CREATE TABLE departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id uuid REFERENCES departments(id),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE user_role_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES users(id),
  role_id uuid NOT NULL REFERENCES roles(id),
  scope permission_scope NOT NULL,
  scope_id uuid,
  granted_by uuid REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role_id, scope, scope_id)
);

CREATE TABLE role_permissions (
  role_id uuid NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id uuid NOT NULL REFERENCES departments(id),
  name text NOT NULL,
  status record_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE people (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE REFERENCES users(id),
  position_id uuid REFERENCES positions(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  manager_id uuid REFERENCES people(id),
  display_name text NOT NULL,
  email text,
  photo_key text,
  start_date date,
  status record_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE node_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  color text NOT NULL,
  icon text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  visual_config jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_type_id uuid NOT NULL REFERENCES node_types(id),
  department_id uuid REFERENCES departments(id),
  code text,
  name text NOT NULL,
  summary text,
  status record_status NOT NULL DEFAULT 'DRAFT',
  criticality smallint CHECK (criticality BETWEEN 1 AND 5),
  created_by uuid NOT NULL REFERENCES users(id),
  updated_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (node_type_id, code)
);

CREATE INDEX nodes_context_idx ON nodes (department_id, node_type_id, status) WHERE deleted_at IS NULL;
CREATE INDEX nodes_name_search_idx ON nodes USING gin (to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(summary,'')));

CREATE TABLE relationship_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  inverse_name text,
  allowed_source_types text[] NOT NULL DEFAULT '{}',
  allowed_target_types text[] NOT NULL DEFAULT '{}'
);

CREATE TABLE relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_node_id uuid NOT NULL REFERENCES nodes(id),
  target_node_id uuid NOT NULL REFERENCES nodes(id),
  relationship_type_id uuid NOT NULL REFERENCES relationship_types(id),
  direction relationship_direction NOT NULL DEFAULT 'DIRECTED',
  description text,
  status record_status NOT NULL DEFAULT 'ACTIVE',
  valid_from date,
  valid_until date,
  criticality smallint CHECK (criticality BETWEEN 1 AND 5),
  comments text,
  created_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CHECK (source_node_id <> target_node_id)
);

CREATE UNIQUE INDEX relationships_active_unique_idx ON relationships
  (source_node_id, relationship_type_id, target_node_id, direction)
  WHERE deleted_at IS NULL;
CREATE INDEX relationships_source_idx ON relationships (source_node_id, status) WHERE deleted_at IS NULL;
CREATE INDEX relationships_target_idx ON relationships (target_node_id, status) WHERE deleted_at IS NULL;

CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES users(id),
  name text NOT NULL,
  context_node_id uuid REFERENCES nodes(id),
  filters jsonb NOT NULL DEFAULT '{}'::jsonb,
  viewport jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_shared boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE saved_view_nodes (
  saved_view_id uuid NOT NULL REFERENCES saved_views(id) ON DELETE CASCADE,
  node_id uuid NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
  x double precision NOT NULL,
  y double precision NOT NULL,
  collapsed boolean NOT NULL DEFAULT false,
  PRIMARY KEY (saved_view_id, node_id)
);

CREATE TABLE processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL UNIQUE REFERENCES nodes(id),
  owner_person_id uuid REFERENCES people(id),
  objective text,
  scope_start text,
  scope_end text,
  version integer NOT NULL DEFAULT 1
);

CREATE TABLE activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL UNIQUE REFERENCES nodes(id),
  process_id uuid NOT NULL REFERENCES processes(id),
  responsible_person_id uuid REFERENCES people(id),
  objective text,
  main_input text,
  main_output text,
  estimated_minutes integer CHECK (estimated_minutes >= 0),
  frequency text,
  last_reviewed_at date
);

CREATE TABLE raci_assignments (
  activity_id uuid NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
  person_id uuid NOT NULL REFERENCES people(id),
  role raci_role NOT NULL,
  PRIMARY KEY (activity_id, person_id, role)
);

CREATE TABLE documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid UNIQUE REFERENCES nodes(id),
  department_id uuid NOT NULL REFERENCES departments(id),
  code text NOT NULL,
  name text NOT NULL,
  type text NOT NULL,
  status record_status NOT NULL DEFAULT 'DRAFT',
  current_version_id uuid,
  owner_id uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  UNIQUE (department_id, code)
);

CREATE TABLE document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL REFERENCES documents(id),
  version text NOT NULL,
  title text NOT NULL,
  objective text,
  scope text,
  content jsonb NOT NULL DEFAULT '{}'::jsonb,
  status record_status NOT NULL DEFAULT 'DRAFT',
  authored_by uuid NOT NULL REFERENCES users(id),
  issued_at date,
  review_at date,
  valid_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, version)
);

ALTER TABLE documents ADD CONSTRAINT documents_current_version_fk
  FOREIGN KEY (current_version_id) REFERENCES document_versions(id);

CREATE TABLE manuals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid NOT NULL UNIQUE REFERENCES document_versions(id),
  activity_id uuid REFERENCES activities(id),
  prerequisites text,
  inputs text,
  outputs text,
  references_text text
);

CREATE TABLE manual_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  manual_id uuid NOT NULL REFERENCES manuals(id) ON DELETE CASCADE,
  position integer NOT NULL CHECK (position > 0),
  title text NOT NULL,
  description text NOT NULL,
  advice text,
  warning text,
  expected_result text,
  common_error text,
  estimated_minutes integer,
  evidence_required text,
  validation_text text,
  continue_condition text,
  UNIQUE (manual_id, position)
);

CREATE TABLE attachments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid REFERENCES document_versions(id),
  manual_step_id uuid REFERENCES manual_steps(id),
  storage_key text NOT NULL UNIQUE,
  original_name text NOT NULL,
  detected_mime text NOT NULL,
  byte_size bigint NOT NULL CHECK (byte_size >= 0),
  sha256 text NOT NULL,
  scan_status text NOT NULL DEFAULT 'PENDING',
  uploaded_by uuid NOT NULL REFERENCES users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_version_id uuid NOT NULL REFERENCES document_versions(id),
  requested_by uuid NOT NULL REFERENCES users(id),
  assigned_to uuid NOT NULL REFERENCES users(id),
  decision text NOT NULL DEFAULT 'PENDING',
  comments text,
  decided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid REFERENCES nodes(id),
  document_version_id uuid REFERENCES document_versions(id),
  parent_id uuid REFERENCES comments(id),
  author_id uuid NOT NULL REFERENCES users(id),
  body text NOT NULL,
  status text NOT NULL DEFAULT 'OPEN',
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  CHECK (node_id IS NOT NULL OR document_version_id IS NOT NULL)
);

CREATE TABLE risks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES nodes(id),
  name text NOT NULL,
  cause text,
  consequence text,
  probability smallint NOT NULL CHECK (probability BETWEEN 1 AND 5),
  impact smallint NOT NULL CHECK (impact BETWEEN 1 AND 5),
  owner_id uuid REFERENCES people(id),
  status record_status NOT NULL DEFAULT 'ACTIVE'
);

CREATE TABLE controls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  risk_id uuid NOT NULL REFERENCES risks(id),
  name text NOT NULL,
  type text NOT NULL,
  description text,
  owner_id uuid REFERENCES people(id)
);

CREATE TABLE kpis (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  node_id uuid NOT NULL REFERENCES nodes(id),
  name text NOT NULL,
  formula text NOT NULL,
  target text NOT NULL,
  frequency text NOT NULL,
  source text,
  owner_id uuid REFERENCES people(id)
);

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  actor_id uuid REFERENCES users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NOT NULL,
  field_name text,
  old_value jsonb,
  new_value jsonb,
  comment text,
  correlation_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_hash text
);

CREATE INDEX audit_entity_idx ON audit_logs (entity_type, entity_id, occurred_at DESC);
CREATE INDEX approvals_assignee_idx ON approvals (assigned_to, decision, created_at DESC);
CREATE INDEX documents_review_idx ON documents (status, department_id) WHERE deleted_at IS NULL;

COMMIT;
