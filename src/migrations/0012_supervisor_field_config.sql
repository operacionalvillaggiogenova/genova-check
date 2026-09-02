-- Supervisores podem manter a estrutura operacional compartilhada
-- (unidades de leitura, áreas comuns e pontos de ronda).
INSERT OR IGNORE INTO role_permissions(role_id,permission_id,created_at)
SELECT 'role-supervisor', id, datetime('now')
FROM permissions
WHERE code='settings.manage';
