-- =============================================================================
-- EscolarTime — schema no Postgres próprio (Coolify), sem Supabase.
--
-- Estado das tabelas copiado do banco de produção do Supabase em 2026-11-23
-- (information_schema/pg_constraint), que tem colunas além dos arquivos de
-- supabase/migrations (time_grids.class_group_id/start_time, time_slots.day_of_week/
-- duration_minutes...). O que era do Supabase sai:
--   • profiles.id não aponta mais para auth.users: o login é do próprio app
--     (Google), e o perfil é encontrado pelo e-mail.
--   • Sem RLS: quem pode ler/gravar é conferido no servidor (src/lib/auth),
--     que é o único que fala com o banco.
--   • O autor do histórico (audit_log) vem de app.actor_id, definido pelo app
--     em cada transação de escrita.
-- =============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE tenants (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text        NOT NULL,
  slug       text        NOT NULL UNIQUE,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE profiles (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  email      text        NOT NULL,
  role       text        NOT NULL CHECK (role IN ('ADMIN', 'COORDINATOR', 'VIEWER')),
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Último login (antes vinha de auth.users.last_sign_in_at no Supabase).
  last_login_at timestamptz
);
CREATE UNIQUE INDEX profiles_email_key ON profiles (lower(email));
CREATE INDEX idx_profiles_tenant_id ON profiles (tenant_id);

CREATE TABLE school_units (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  code       text        NOT NULL,
  address    text,
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT school_units_tenant_id_code_key UNIQUE (tenant_id, code)
);
CREATE INDEX idx_school_units_tenant_id ON school_units (tenant_id);

CREATE TABLE subjects (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  name       text        NOT NULL,
  code       text        NOT NULL,
  color      text        NOT NULL DEFAULT '#048BA8',
  active     boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subjects_tenant_id ON subjects (tenant_id);

CREATE TABLE teachers (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id          uuid        NOT NULL REFERENCES tenants(id),
  name               text        NOT NULL,
  email              text,
  phone              text,
  max_daily_lessons  int,
  max_weekly_lessons int,
  active             boolean     NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_teachers_tenant_id ON teachers (tenant_id);

CREATE TABLE class_groups (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_unit_id      uuid        NOT NULL REFERENCES school_units(id),
  tenant_id           uuid        NOT NULL REFERENCES tenants(id),
  name                text        NOT NULL,
  shift               text        CHECK (shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  year                int         NOT NULL,
  active              boolean     NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  homeroom_teacher_id uuid        REFERENCES teachers(id) ON DELETE SET NULL
);
CREATE INDEX idx_class_groups_school_unit_id ON class_groups (school_unit_id);
CREATE INDEX idx_class_groups_tenant_id ON class_groups (tenant_id);

CREATE TABLE class_subjects (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  class_group_id      uuid    NOT NULL REFERENCES class_groups(id) ON DELETE CASCADE,
  subject_id          uuid    NOT NULL REFERENCES subjects(id),
  weekly_lessons      int     NOT NULL,
  allow_double_lesson boolean NOT NULL DEFAULT false,
  max_double_lessons  int,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  group_key           text,
  CONSTRAINT class_subjects_class_group_id_subject_id_key UNIQUE (class_group_id, subject_id)
);
CREATE INDEX idx_class_subjects_class_group_id ON class_subjects (class_group_id);
CREATE INDEX idx_class_subjects_group_key ON class_subjects (group_key) WHERE group_key IS NOT NULL;

CREATE TABLE teaching_assignments (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id       uuid NOT NULL REFERENCES teachers(id),
  class_subject_id uuid NOT NULL UNIQUE REFERENCES class_subjects(id) ON DELETE CASCADE,
  notes            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_teaching_assignments_teacher_id ON teaching_assignments (teacher_id);

CREATE TABLE time_grids (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_unit_id uuid        NOT NULL REFERENCES school_units(id),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  name           text        NOT NULL,
  shift          text        CHECK (shift IN ('MORNING', 'AFTERNOON', 'EVENING')),
  days_of_week   int[]       NOT NULL,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  class_group_id uuid        REFERENCES class_groups(id) ON DELETE CASCADE,
  start_time     text        DEFAULT '07:00',
  vigencia       text
);
CREATE INDEX idx_time_grids_class_group_id ON time_grids (class_group_id);
CREATE INDEX idx_time_grids_school_unit_id ON time_grids (school_unit_id);
CREATE INDEX idx_time_grids_tenant_id ON time_grids (tenant_id);
CREATE INDEX idx_time_grids_vigencia ON time_grids (tenant_id, vigencia);

CREATE TABLE time_slots (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  time_grid_id     uuid NOT NULL REFERENCES time_grids(id) ON DELETE CASCADE,
  slot_order       int  NOT NULL,
  start_time       text,
  end_time         text,
  type             text CHECK (type IN ('LESSON', 'BREAK', 'ROUTINE')),
  label            text,
  day_of_week      int,
  duration_minutes int,
  CONSTRAINT time_slots_grid_day_order_unique UNIQUE (time_grid_id, day_of_week, slot_order)
);
CREATE INDEX idx_time_slots_time_grid_id ON time_slots (time_grid_id);

CREATE TABLE teacher_constraints (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id     uuid        NOT NULL REFERENCES teachers(id),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  type           text        NOT NULL,
  priority       text        CHECK (priority IN ('MANDATORY', 'PREFERRED')),
  days_of_week   int[],
  school_unit_id uuid        REFERENCES school_units(id),
  subject_id     uuid        REFERENCES subjects(id),
  time_from      text,
  time_to        text,
  slot_order     int,
  min_gap_slots  int,
  value          jsonb,
  description    text,
  active         boolean     NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_teacher_constraints_teacher_id ON teacher_constraints (teacher_id);
CREATE INDEX idx_teacher_constraints_tenant_id ON teacher_constraints (tenant_id);

CREATE TABLE global_rules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id   uuid        NOT NULL REFERENCES tenants(id),
  type        text        NOT NULL,
  priority    text        CHECK (priority IN ('MANDATORY', 'PREFERRED')),
  weight      float       NOT NULL DEFAULT 1.0,
  params      jsonb,
  description text,
  active      boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_global_rules_tenant_id ON global_rules (tenant_id);

CREATE TABLE generated_schedules (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id       uuid        NOT NULL REFERENCES tenants(id),
  name            text        NOT NULL,
  config_snapshot jsonb,
  status          text        CHECK (status IN ('GENERATING', 'COMPLETED', 'FAILED')),
  score           float,
  violations      jsonb,
  is_baseline     boolean     NOT NULL DEFAULT false,
  baseline_weight float       NOT NULL DEFAULT 0.7,
  created_by      uuid        REFERENCES profiles(id),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz,
  deleted_by      uuid,
  deleted_reason  text        CHECK (deleted_reason IN ('manual', 'replaced_by_edit')),
  replaced_by     uuid        REFERENCES generated_schedules(id)
);
CREATE INDEX idx_generated_schedules_active ON generated_schedules (tenant_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_generated_schedules_tenant_id ON generated_schedules (tenant_id);

CREATE TABLE schedule_entries (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  generated_schedule_id  uuid    NOT NULL REFERENCES generated_schedules(id) ON DELETE CASCADE,
  teaching_assignment_id uuid    NOT NULL REFERENCES teaching_assignments(id),
  day_of_week            int     NOT NULL,
  time_slot_id           uuid    NOT NULL REFERENCES time_slots(id),
  locked                 boolean NOT NULL DEFAULT false,
  CONSTRAINT schedule_entries_generated_schedule_id_teaching_assignment__key
    UNIQUE (generated_schedule_id, teaching_assignment_id, day_of_week, time_slot_id)
);
CREATE INDEX idx_schedule_entries_schedule_id ON schedule_entries (generated_schedule_id);

-- updated_at automático
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'profiles', 'school_units', 'subjects', 'teachers', 'class_groups',
    'class_subjects', 'teaching_assignments', 'time_grids', 'teacher_constraints',
    'global_rules', 'generated_schedules'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION set_updated_at()',
      t || '_updated_at', t);
  END LOOP;
END;
$$;

-- ---------------------------------------------------------------------------
-- Histórico de alterações (mesma lógica da migration 008 do Supabase)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_log (
  id             bigint      GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id      uuid,
  occurred_at    timestamptz NOT NULL DEFAULT now(),
  -- Sem FK: o histórico sobrevive ao usuário.
  actor_id       uuid,
  actor_name     text,
  actor_email    text,
  action         text        NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  table_name     text        NOT NULL,
  record_id      uuid,
  record_label   text,
  changed_fields text[],
  old_data       jsonb,
  new_data       jsonb
);
CREATE INDEX idx_audit_log_tenant_time ON audit_log (tenant_id, occurred_at DESC);
CREATE INDEX idx_audit_log_actor_time  ON audit_log (actor_id, occurred_at DESC);
CREATE INDEX idx_audit_log_record      ON audit_log (table_name, record_id);

CREATE OR REPLACE FUNCTION audit_row_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_actor   uuid;
  v_tenant  uuid;
  v_label   text;
  v_name    text;
  v_email   text;
  -- Colunas grandes que não ajudam a entender a alteração.
  v_omit    text[] := ARRAY['config_snapshot', 'violations'];
BEGIN
  IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD); END IF;
  IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW); END IF;
  v_row := coalesce(v_new, v_old);

  IF TG_OP = 'UPDATE' THEN
    SELECT array_agg(n.key ORDER BY n.key)
      INTO v_changed
      FROM jsonb_each(v_new) n
     WHERE n.key NOT IN ('updated_at', 'last_login_at')
       AND n.value IS DISTINCT FROM v_old -> n.key;

    -- Nada mudou de fato (ex.: só updated_at): não polui o histórico.
    IF v_changed IS NULL THEN
      RETURN NULL;
    END IF;

    -- Em alterações guarda só o antes/depois do que mudou.
    SELECT jsonb_object_agg(key, v_old -> key), jsonb_object_agg(key, v_new -> key)
      INTO v_old, v_new
      FROM unnest(v_changed) AS key;
  END IF;

  v_old := v_old - v_omit;
  v_new := v_new - v_omit;

  -- Autor: o app grava sempre dentro de uma transação com
  -- set_config('app.actor_id', <perfil>, true) (src/lib/db). Sem isso (SQL
  -- direto, scripts, migrações) fica nulo = "Sistema".
  v_actor := nullif(current_setting('app.actor_id', true), '')::uuid;

  IF v_actor IS NOT NULL THEN
    SELECT name, email INTO v_name, v_email FROM profiles WHERE id = v_actor;
  END IF;

  -- Tenant
  v_tenant := CASE TG_TABLE_NAME
    WHEN 'tenants' THEN (v_row ->> 'id')::uuid
    ELSE (v_row ->> 'tenant_id')::uuid
  END;

  IF v_tenant IS NULL THEN
    v_tenant := CASE TG_TABLE_NAME
      WHEN 'class_subjects' THEN
        (SELECT tenant_id FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid)
      WHEN 'teaching_assignments' THEN
        (SELECT tenant_id FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid)
      WHEN 'time_slots' THEN
        (SELECT tenant_id FROM time_grids WHERE id = (v_row ->> 'time_grid_id')::uuid)
    END;
  END IF;

  IF v_tenant IS NULL AND v_actor IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant FROM profiles WHERE id = v_actor;
  END IF;

  -- Nome legível do registro (gravado agora: o registro pode deixar de existir).
  v_label := CASE TG_TABLE_NAME
    WHEN 'class_subjects' THEN concat_ws(' · ',
      (SELECT name FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid),
      (SELECT name FROM subjects     WHERE id = (v_row ->> 'subject_id')::uuid))
    WHEN 'teaching_assignments' THEN concat_ws(' · ',
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      (SELECT concat_ws(' · ', cg.name, s.name)
         FROM class_subjects cs
         JOIN class_groups cg ON cg.id = cs.class_group_id
         JOIN subjects s      ON s.id  = cs.subject_id
        WHERE cs.id = (v_row ->> 'class_subject_id')::uuid))
    WHEN 'time_slots' THEN concat_ws(' · ',
      (SELECT name FROM time_grids WHERE id = (v_row ->> 'time_grid_id')::uuid),
      nullif(v_row ->> 'label', ''),
      left(v_row ->> 'start_time', 5) || '–' || left(v_row ->> 'end_time', 5))
    WHEN 'teacher_constraints' THEN concat_ws(' · ',
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      coalesce(nullif(v_row ->> 'description', ''), v_row ->> 'type'))
    WHEN 'global_rules' THEN
      coalesce(nullif(v_row ->> 'description', ''), v_row ->> 'type')
    WHEN 'diary_checks' THEN concat_ws(' · ',
      (SELECT name FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid),
      coalesce((SELECT name FROM subjects WHERE id = (v_row ->> 'subject_id')::uuid), 'Regente'),
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      lpad(v_row ->> 'month', 2, '0') || '/' || (v_row ->> 'year'))
    WHEN 'diary_extra_rows' THEN concat_ws(' · ',
      (SELECT name FROM class_groups WHERE id = (v_row ->> 'class_group_id')::uuid),
      coalesce((SELECT name FROM subjects WHERE id = (v_row ->> 'subject_id')::uuid), 'Regente'),
      (SELECT name FROM teachers WHERE id = (v_row ->> 'teacher_id')::uuid),
      v_row ->> 'year')
    ELSE v_row ->> 'name'
  END;

  INSERT INTO audit_log (
    tenant_id, actor_id, actor_name, actor_email, action, table_name,
    record_id, record_label, changed_fields, old_data, new_data
  ) VALUES (
    v_tenant, v_actor, v_name, v_email, TG_OP, TG_TABLE_NAME,
    (v_row ->> 'id')::uuid, nullif(v_label, ''), v_changed, v_old, v_new
  );

  RETURN NULL;
END;
$$;

-- schedule_entries fica de fora: cada horário gravado são centenas de aulas, e a
-- criação/edição/exclusão do horário já fica em generated_schedules.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'tenants', 'profiles', 'school_units', 'subjects', 'class_groups',
    'class_subjects', 'teachers', 'teaching_assignments', 'time_grids',
    'time_slots', 'teacher_constraints', 'global_rules', 'generated_schedules'
  ]
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
      t || '_audit', t);
  END LOOP;
END;
$$;
