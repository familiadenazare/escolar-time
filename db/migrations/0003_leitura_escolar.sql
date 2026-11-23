-- Leitura dos diários no Escolar Manager pelo robô rpa-pedagogico.
--
-- O robô emite o "Diário de Classe" de cada turma × disciplina × mês no Escolar
-- Manager, lê o PDF e manda aula por aula (data, chamada lançada, conteúdo) para
-- POST /api/robo/diarios. A conferência continua humana: a leitura aparece na
-- grade de diários e a coordenação marca a situação (diary_checks).
--
-- As leituras ficam com os nomes do Escolar. em_links liga cada nome a um
-- cadastro daqui (turma, disciplina, professor); a ligação é feita sozinha
-- quando o nome bate sem ambiguidade, e o resto na tela "Vínculos com o
-- Escolar". Como a junção é feita na consulta, um vínculo novo vale também
-- para as leituras antigas.

CREATE TABLE em_links (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid        NOT NULL REFERENCES tenants(id),
  kind       text        NOT NULL CHECK (kind IN ('turma', 'disciplina', 'professor')),
  -- Chave do Escolar: nome normalizado (turma leva o ano: "2026|3 SERIE EM").
  em_key     text        NOT NULL,
  -- Como o nome aparece no Escolar (coluna "name": é o rótulo no Histórico).
  name       text        NOT NULL,
  -- class_groups / subjects / teachers. Nulo = ainda sem vínculo.
  local_id   uuid,
  -- "Não usar": nome do Escolar que não corresponde a nada daqui.
  ignored    boolean     NOT NULL DEFAULT false,
  auto       boolean     NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT em_links_unique UNIQUE (tenant_id, kind, em_key)
);
CREATE INDEX idx_em_links_local ON em_links (local_id);

CREATE TRIGGER em_links_updated_at BEFORE UPDATE ON em_links
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER em_links_audit AFTER INSERT OR UPDATE OR DELETE ON em_links
  FOR EACH ROW EXECUTE FUNCTION audit_row_change();

CREATE TABLE diary_readings (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         uuid        NOT NULL REFERENCES tenants(id),
  em_turma_key      text        NOT NULL,
  em_disciplina_key text        NOT NULL,
  em_professor_key  text,
  year              int         NOT NULL CHECK (year BETWEEN 2000 AND 2100),
  month             int         NOT NULL CHECK (month BETWEEN 1 AND 12),
  -- [{ "date": "2026-11-03", "attendance": true, "content": "Frações" | null }]
  lessons           jsonb       NOT NULL DEFAULT '[]',
  -- Aulas previstas / realizadas do período, como o Escolar mostra (se vierem).
  planned           int,
  given             int,
  read_at           timestamptz NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT diary_readings_unique UNIQUE (tenant_id, em_turma_key, em_disciplina_key, year, month)
);
CREATE INDEX idx_diary_readings_year ON diary_readings (tenant_id, year);

-- Sem histórico (audit): o robô regrava centenas de leituras toda madrugada.
CREATE TRIGGER diary_readings_updated_at BEFORE UPDATE ON diary_readings
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
