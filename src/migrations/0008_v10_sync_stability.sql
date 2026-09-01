PRAGMA foreign_keys = ON;

-- Índices de busca para os identificadores gerados no aparelho.
-- Não são UNIQUE deliberadamente: bancos já utilizados podem conter duplicatas
-- e a migration não deve falhar nem apagar dados históricos.
CREATE INDEX IF NOT EXISTS idx_ronda_sessions_source_local
  ON ronda_sessions(source_local_id);

CREATE INDEX IF NOT EXISTS idx_fiscalizacao_reports_source_local
  ON fiscalizacao_reports(source_local_id);

CREATE INDEX IF NOT EXISTS idx_diario_reports_source_local
  ON diario_reports(source_local_id);

