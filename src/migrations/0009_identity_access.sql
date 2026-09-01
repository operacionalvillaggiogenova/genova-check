PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  activity_scope TEXT NOT NULL DEFAULT 'TEAM'
    CHECK (activity_scope IN ('OWN','TEAM','ALL')),
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT NOT NULL COLLATE NOCASE UNIQUE,
  email TEXT COLLATE NOCASE UNIQUE,
  password_hash TEXT NOT NULL,
  role_id TEXT NOT NULL,
  team_id TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  must_change_password INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(role_id) REFERENCES roles(id),
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role_id, active);
CREATE INDEX IF NOT EXISTS idx_users_team ON users(team_id, active);

CREATE TABLE IF NOT EXISTS permissions (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  module TEXT NOT NULL,
  action TEXT NOT NULL,
  description TEXT,
  UNIQUE(module, action)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(role_id, permission_id),
  FOREIGN KEY(role_id) REFERENCES roles(id) ON DELETE CASCADE,
  FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_permission_overrides (
  user_id TEXT NOT NULL,
  permission_id TEXT NOT NULL,
  effect TEXT NOT NULL CHECK (effect IN ('ALLOW','DENY')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, permission_id),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(permission_id) REFERENCES permissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS module_catalog (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  icon TEXT,
  module_group TEXT NOT NULL DEFAULT 'FIELD',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS team_modules (
  team_id TEXT NOT NULL,
  module_code TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(team_id, module_code),
  FOREIGN KEY(team_id) REFERENCES teams(id) ON DELETE CASCADE,
  FOREIGN KEY(module_code) REFERENCES module_catalog(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_module_overrides (
  user_id TEXT NOT NULL,
  module_code TEXT NOT NULL,
  enabled INTEGER NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id, module_code),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(module_code) REFERENCES module_catalog(code) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  last_seen_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  user_agent TEXT,
  ip_hash TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS auth_attempts (
  attempt_key TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  first_attempt_at TEXT NOT NULL,
  last_attempt_at TEXT NOT NULL,
  blocked_until TEXT
);

CREATE TABLE IF NOT EXISTS system_settings (
  setting_key TEXT PRIMARY KEY,
  setting_value TEXT,
  updated_by TEXT,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(updated_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS routing_rules (
  category_code TEXT PRIMARY KEY,
  category_name TEXT NOT NULL,
  team_id TEXT NOT NULL,
  auto_create_activity INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(team_id) REFERENCES teams(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  details_json TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(actor_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_audit_entity
  ON audit_log(entity_type, entity_id, created_at);
CREATE INDEX IF NOT EXISTS idx_audit_actor
  ON audit_log(actor_user_id, created_at);

INSERT OR IGNORE INTO roles(id,code,name,sort_order,created_at) VALUES
  ('role-admin','ADMIN','Administrador',10,datetime('now')),
  ('role-supervisor','SUPERVISOR','Supervisor',20,datetime('now')),
  ('role-operational','OPERATIONAL','Operacional',30,datetime('now'));

INSERT OR IGNORE INTO teams(id,code,name,activity_scope,active,created_at,updated_at) VALUES
  ('team-portaria','PORTARIA','Portaria','TEAM',1,datetime('now'),datetime('now')),
  ('team-maintenance','MANUTENCAO','Manutenção','TEAM',1,datetime('now'),datetime('now')),
  ('team-cleaning','LIMPEZA','Limpeza','TEAM',1,datetime('now'),datetime('now')),
  ('team-third-party','TERCEIROS','Terceiros','TEAM',1,datetime('now'),datetime('now')),
  ('team-zeladoria','ZELADORIA','Zeladoria','ALL',1,datetime('now'),datetime('now')),
  ('team-security','VIGILANCIA','Vigilantes','TEAM',1,datetime('now'),datetime('now')),
  ('team-general-services','SERVICOS_GERAIS','Serviços Gerais','TEAM',1,datetime('now'),datetime('now'));

INSERT OR IGNORE INTO permissions(id,code,module,action,description) VALUES
  ('perm-users-view','users.view','users','view','Consultar usuários'),
  ('perm-users-manage','users.manage','users','manage','Administrar usuários'),
  ('perm-access-view','access.view','access','view','Consultar acessos'),
  ('perm-access-manage','access.manage','access','manage','Administrar acessos'),
  ('perm-settings-view','settings.view','settings','view','Consultar configurações'),
  ('perm-settings-manage','settings.manage','settings','manage','Alterar configurações'),
  ('perm-activities-view','activities.view','activities','view','Consultar atividades'),
  ('perm-activities-create','activities.create','activities','create','Criar atividades'),
  ('perm-activities-edit','activities.edit','activities','edit','Editar atividades'),
  ('perm-activities-assign','activities.assign','activities','assign','Atribuir atividades'),
  ('perm-activities-execute','activities.execute','activities','execute','Executar atividades'),
  ('perm-activities-cancel','activities.cancel','activities','cancel','Cancelar atividades'),
  ('perm-activities-view-all','activities.view_all','activities','view_all','Consultar todas as equipes'),
  ('perm-recurrences-view','recurrences.view','recurrences','view','Consultar recorrências'),
  ('perm-recurrences-manage','recurrences.manage','recurrences','manage','Administrar recorrências'),
  ('perm-requests-view','requests.view','requests','view','Consultar chamados'),
  ('perm-requests-manage','requests.manage','requests','manage','Administrar chamados'),
  ('perm-reports-view','reports.view','reports','view','Consultar relatórios'),
  ('perm-reports-export','reports.export','reports','export','Exportar relatórios'),
  ('perm-rateio-view','rateio.view','rateio','view','Consultar rateio'),
  ('perm-rateio-manage','rateio.manage','rateio','manage','Administrar rateio'),
  ('perm-tools-view','tools.view','tools','view','Utilizar ferramentas de campo');

-- Administrador recebe todas as permissões existentes.
INSERT OR IGNORE INTO role_permissions(role_id,permission_id,created_at)
SELECT 'role-admin', id, datetime('now') FROM permissions;

-- Supervisor recebe gestão operacional, sem segurança de usuários por padrão.
INSERT OR IGNORE INTO role_permissions(role_id,permission_id,created_at)
SELECT 'role-supervisor', id, datetime('now') FROM permissions
WHERE code IN (
  'settings.view','activities.view','activities.create','activities.edit',
  'activities.assign','activities.execute','activities.cancel',
  'recurrences.view','requests.view','requests.manage',
  'reports.view','reports.export','rateio.view','tools.view'
);

-- Operacional executa demandas e usa ferramentas liberadas para sua equipe.
INSERT OR IGNORE INTO role_permissions(role_id,permission_id,created_at)
SELECT 'role-operational', id, datetime('now') FROM permissions
WHERE code IN ('activities.view','activities.execute','requests.view','tools.view');

INSERT OR IGNORE INTO module_catalog(code,name,path,icon,module_group,sort_order,active) VALUES
  ('activities','Atividades','/activities.html','✓','CORE',10,1),
  ('recurrences','Recorrências','/recurrences.html','R','CORE',20,1),
  ('requests','Chamados','/requests.html','!','CORE',30,1),
  ('diary','Diário de Serviços','/diario.html','D','FIELD',40,1),
  ('check','Checagem','/check.html','✓','FIELD',40,1),
  ('scanner','Scanner / Documentos','/scanner.html','S','FIELD',50,1),
  ('budgets','Orçamentos','/orcamentos.html','$','FIELD',60,1),
  ('reimbursement','Reembolso','/reembolso.html','R','FIELD',70,1),
  ('inspection','Fiscalização','/fiscalizacao.html','F','FIELD',80,1),
  ('ronda','Ronda','/ronda.html','O','FIELD',90,1),
  ('leiturista','Leiturista','/leiturista.html','L','FIELD',100,1),
  ('rateio','Rateio','/rateios.html','%','FIELD',110,1),
  ('admin-rateio','Administração do Rateio','/adm-rateio.html','A','ADMIN',120,1),
  ('reports','Relatórios','/adm.html','R','ADMIN',130,1),
  ('settings','Configurações','/admin-config.html','C','ADMIN',140,1);

-- Ferramentas comuns a todas as equipes.
INSERT OR IGNORE INTO team_modules(team_id,module_code,enabled,updated_at)
SELECT t.id,m.code,1,datetime('now')
FROM teams t JOIN module_catalog m
WHERE m.code IN ('activities','diary','check','scanner','budgets','reimbursement','inspection');

INSERT OR IGNORE INTO team_modules(team_id,module_code,enabled,updated_at) VALUES
  ('team-portaria','requests',1,datetime('now')),
  ('team-maintenance','requests',1,datetime('now')),
  ('team-maintenance','recurrences',1,datetime('now')),
  ('team-maintenance','leiturista',1,datetime('now')),
  ('team-maintenance','rateio',1,datetime('now')),
  ('team-zeladoria','requests',1,datetime('now')),
  ('team-zeladoria','leiturista',1,datetime('now')),
  ('team-zeladoria','rateio',1,datetime('now')),
  ('team-security','ronda',1,datetime('now'));

INSERT OR IGNORE INTO routing_rules(category_code,category_name,team_id,auto_create_activity,active,updated_at) VALUES
  ('PORTARIA','Portaria','team-portaria',1,1,datetime('now')),
  ('LIMPEZA','Limpeza','team-cleaning',1,1,datetime('now')),
  ('MANUTENCAO','Manutenção','team-maintenance',1,1,datetime('now')),
  ('HIDRAULICA','Hidráulica','team-maintenance',1,1,datetime('now')),
  ('ELETRICA','Elétrica','team-maintenance',1,1,datetime('now')),
  ('ESTRUTURAL','Problema estrutural','team-maintenance',1,1,datetime('now')),
  ('AREA_EXTERNA','Área externa','team-zeladoria',1,1,datetime('now')),
  ('SERVICOS_GERAIS','Serviços gerais','team-general-services',1,1,datetime('now')),
  ('OUTRO','Outro','team-zeladoria',0,1,datetime('now'));
