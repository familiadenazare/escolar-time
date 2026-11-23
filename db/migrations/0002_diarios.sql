-- Verificação dos diários de classe (substitui a planilha "RELATÓRIO DIÁRIOS").
--
-- A coordenação confere, mês a mês, o diário de cada professor em cada turma e
-- marca a situação. As linhas de cada turma não são cadastradas aqui: saem das
-- Atribuições (teaching_assignments) e da regente (class_groups.homeroom_teacher_id).
-- subject_id nulo = diário da regente (todas as disciplinas dela na turma).
-- diary_extra_rows: linhas acrescentadas à mão (ex.: substituto).
-- FKs sem CASCADE de propósito: apagar turma/disciplina/professor com diário
-- verificado falha em vez de apagar o histórico em silêncio.

-- ---------------------------------------------------------------------------
-- 1. diary_checks
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diary_checks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  class_group_id uuid        NOT NULL REFERENCES class_groups(id),
  teacher_id     uuid        NOT NULL REFERENCES teachers(id),
  subject_id     uuid        REFERENCES subjects(id),
  year           int         NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month          int         NOT NULL CHECK (month BETWEEN 1 AND 12),
  status         text        NOT NULL CHECK (status IN (
                   'ASSINADO', 'PREENCHIDO', 'INCOMPLETO_CONTEUDO',
                   'INCOMPLETO_PRES_CONTEUDO', 'FALTA_CONTEUDO', 'FALTA_TUDO',
                   'FERIAS', 'LICENCA'
                 )),
  notes          text,
  -- Sem FK (como deleted_by, migration 004): sobrevive ao usuário.
  checked_by     uuid,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_checks_unique
    UNIQUE NULLS NOT DISTINCT (class_group_id, teacher_id, subject_id, year, month)
);

CREATE INDEX IF NOT EXISTS idx_diary_checks_tenant_year ON diary_checks (tenant_id, year);
CREATE INDEX IF NOT EXISTS idx_diary_checks_teacher     ON diary_checks (teacher_id);
CREATE INDEX IF NOT EXISTS idx_diary_checks_subject     ON diary_checks (subject_id);

DROP TRIGGER IF EXISTS diary_checks_updated_at ON diary_checks;
CREATE TRIGGER diary_checks_updated_at
  BEFORE UPDATE ON diary_checks
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ---------------------------------------------------------------------------
-- 2. diary_extra_rows
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS diary_extra_rows (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id      uuid        NOT NULL REFERENCES tenants(id),
  class_group_id uuid        NOT NULL REFERENCES class_groups(id),
  teacher_id     uuid        NOT NULL REFERENCES teachers(id),
  subject_id     uuid        REFERENCES subjects(id),
  year           int         NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  notes          text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_extra_rows_unique
    UNIQUE NULLS NOT DISTINCT (class_group_id, teacher_id, subject_id, year)
);

CREATE INDEX IF NOT EXISTS idx_diary_extra_rows_tenant_year ON diary_extra_rows (tenant_id, year);
CREATE INDEX IF NOT EXISTS idx_diary_extra_rows_teacher     ON diary_extra_rows (teacher_id);
CREATE INDEX IF NOT EXISTS idx_diary_extra_rows_subject     ON diary_extra_rows (subject_id);

DROP TRIGGER IF EXISTS diary_extra_rows_updated_at ON diary_extra_rows;
CREATE TRIGGER diary_extra_rows_updated_at
  BEFORE UPDATE ON diary_extra_rows
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['diary_checks', 'diary_extra_rows']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER %I AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION audit_row_change()',
      t || '_audit', t);
  END LOOP;
END;
$$;
