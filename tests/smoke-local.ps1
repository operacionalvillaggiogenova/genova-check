$ErrorActionPreference = 'Stop'
$base = 'http://127.0.0.1:8787'
$session = [Microsoft.PowerShell.Commands.WebRequestSession]::new()

function Assert-True([bool]$condition, [string]$message) {
  if (-not $condition) { throw "Falha: $message" }
}

function Invoke-Json([string]$method, [string]$path, $body = $null) {
  $params = @{
    Uri = "$base$path"
    Method = $method
    WebSession = $session
    Headers = @{ Accept = 'application/json' }
  }
  if ($null -ne $body) {
    $params.ContentType = 'application/json'
    $params.Body = ($body | ConvertTo-Json -Depth 8 -Compress)
  }
  Invoke-RestMethod @params
}

$status = Invoke-Json GET '/api/auth/status'
Assert-True ($status.product -eq 'blexo-suite') 'nome do produto'

if ($status.setupRequired) {
  $setup = Invoke-Json POST '/api/auth/setup' @{
    name = 'Administrador Local'
    username = 'admin.local'
    password = 'teste-local-123'
    teamCode = 'ZELADORIA'
  }
  Assert-True $setup.ok 'configuração inicial'
} else {
  $login = Invoke-Json POST '/api/auth/login' @{
    username = 'admin.local'
    password = 'teste-local-123'
  }
  Assert-True $login.ok 'login local'
}

$me = Invoke-Json GET '/api/auth/me'
Assert-True ($me.user.role.code -eq 'ADMIN') 'perfil do administrador'
Assert-True ($me.user.team.code -eq 'ZELADORIA') 'equipe do administrador'

$access = Invoke-Json GET '/api/admin/access-config'
Assert-True ($access.teams.Count -eq 7) 'sete equipes padrão'
Assert-True (($access.teamModules | Where-Object { $_.team_id -eq 'team-security' -and $_.module_code -eq 'ronda' }).Count -eq 1) 'Ronda para Vigilantes'

$suffix = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$createdUser = Invoke-Json POST '/api/admin/users' @{
  name = 'Operador de Teste'
  username = "operador.$suffix"
  password = 'senha-teste-123'
  roleCode = 'OPERATIONAL'
  teamCode = 'MANUTENCAO'
}
Assert-True $createdUser.ok 'criação de usuário'

$operatorSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$operatorLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -WebSession $operatorSession -ContentType 'application/json' -Body (@{
  username = "operador.$suffix"
  password = 'senha-teste-123'
} | ConvertTo-Json -Compress)
Assert-True $operatorLogin.ok 'login operacional'
$operatorMe = Invoke-RestMethod -Uri "$base/api/auth/me" -Method GET -WebSession $operatorSession
Assert-True (($operatorMe.user.modules | Where-Object code -eq 'leiturista').Count -eq 1) 'Leiturista liberado para Manutenção'
Assert-True (($operatorMe.user.modules | Where-Object code -eq 'ronda').Count -eq 0) 'Ronda não liberada para Manutenção'
$operatorCookie = ($operatorSession.Cookies.GetCookies([Uri]$base) | Where-Object Name -eq 'blexo_session').Value
$forbiddenRondaPayload = @{ id = "ronda-forbidden-$suffix"; points = @() } | ConvertTo-Json -Compress
$forbiddenRondaRaw = & curl.exe -s -X POST -H "Origin: $base" -b "blexo_session=$operatorCookie" --form-string "payload=$forbiddenRondaPayload" "$base/api/ronda/sync"
$forbiddenRonda = $forbiddenRondaRaw | ConvertFrom-Json
Assert-True ($forbiddenRonda.code -eq 'MODULE_FORBIDDEN') 'bloqueio real do módulo Ronda'

$supervisor = Invoke-Json POST '/api/admin/users' @{
  name = 'Supervisor de Teste'
  username = "supervisor.$suffix"
  password = 'senha-teste-123'
  roleCode = 'SUPERVISOR'
  teamCode = 'LIMPEZA'
}
Assert-True $supervisor.ok 'criação de supervisor'
$supervisorSession = [Microsoft.PowerShell.Commands.WebRequestSession]::new()
$supervisorLogin = Invoke-RestMethod -Uri "$base/api/auth/login" -Method POST -WebSession $supervisorSession -ContentType 'application/json' -Body (@{
  username = "supervisor.$suffix"
  password = 'senha-teste-123'
} | ConvertTo-Json -Compress)
Assert-True $supervisorLogin.ok 'login do supervisor'
$supervisorMe = Invoke-RestMethod -Uri "$base/api/auth/me" -Method GET -WebSession $supervisorSession
Assert-True (($supervisorMe.user.modules | Where-Object code -eq 'settings').Count -eq 1) 'Configurações disponíveis ao supervisor'
$supervisorConfig = Invoke-RestMethod -Uri "$base/api/admin/access-config" -Method GET -WebSession $supervisorSession
Assert-True ($supervisorConfig.teams.Count -eq 7) 'consulta de configurações pelo supervisor'

$activity = Invoke-Json POST '/api/activities' @{
  title = 'Verificar bomba de teste'
  description = 'Atividade criada pelo smoke test local.'
  teamCode = 'MANUTENCAO'
  priority = 'HIGH'
  location = 'Casa de bombas'
  requiresNote = $false
  requiresEvidence = $false
}
Assert-True $activity.ok 'criação de atividade'

$started = Invoke-Json POST "/api/activities/$($activity.id)/start" @{}
Assert-True $started.ok 'início da atividade'
$completed = Invoke-Json POST "/api/activities/$($activity.id)/complete" @{ note = 'Concluída no teste local.' }
Assert-True $completed.ok 'conclusão da atividade'

$detail = Invoke-Json GET "/api/activities/$($activity.id)"
Assert-True ($detail.status -eq 'COMPLETED') 'status final da atividade'
Assert-True ($detail.events.Count -ge 3) 'histórico da atividade'

$diary = Invoke-Json GET "/api/activities/diary?date=$([DateTime]::UtcNow.ToString('yyyy-MM-dd'))"
Assert-True (($diary.items | Where-Object { $_.id -eq $activity.id }).Count -eq 1) 'atividade no diário operacional'

$rateioActivity = Invoke-Json POST '/api/activities' @{
  title = 'Enviar rateio de teste'
  teamCode = 'MANUTENCAO'
  priority = 'NORMAL'
  toolCode = 'rateio'
}
$cookie = ($session.Cookies.GetCookies([Uri]$base) | Where-Object Name -eq 'blexo_session').Value
$rateioPayload = @{
  id = "rateio-smoke-$suffix"
  activityId = $rateioActivity.id
  type = 'tags'
  title = 'Rateio Tags - Smoke'
  reportDate = [DateTime]::UtcNow.ToString('yyyy-MM-dd')
  tags = @(@{ block = '01'; apartment = '101'; type = 'pedestre'; qty = 2 })
  changes = @()
  refunds = @()
  scans = @()
} | ConvertTo-Json -Depth 8 -Compress
$rateioRaw = & curl.exe -s -X POST -H "Origin: $base" -b "blexo_session=$cookie" --form-string "payload=$rateioPayload" "$base/api/rateio/submissions"
$rateioSubmission = $rateioRaw | ConvertFrom-Json
Assert-True $rateioSubmission.ok 'envio do Rateio ao Adm-Rateio'
$rateioRows = Invoke-Json GET '/api/adm-rateio/submissions'
Assert-True (($rateioRows | Where-Object { $_.id -eq $rateioSubmission.id }).Count -eq 1) 'recebimento no Adm-Rateio'
$rateioActivityDetail = Invoke-Json GET "/api/activities/$($rateioActivity.id)"
Assert-True (($rateioActivityDetail.events | Where-Object { $_.action -eq 'TOOL_RESULT_SYNCED' }).Count -eq 1) 'vínculo entre ferramenta e atividade'

$recurrence = Invoke-Json POST '/api/recurrences' @{
  title = 'Ronda recorrente de teste'
  description = 'Geração idempotente local.'
  teamCode = 'VIGILANCIA'
  scheduleKind = 'DAILY'
  scheduleInterval = 1
  firstRunAt = [DateTime]::UtcNow.AddMinutes(-1).ToString('o')
  priority = 'NORMAL'
  toolCode = 'ronda'
  requiresEvidence = $true
}
Assert-True $recurrence.ok 'criação de recorrência'

Invoke-WebRequest -Uri "$base/cdn-cgi/local/scheduled" -Method GET | Out-Null
$generated = Invoke-Json GET '/api/activities?team=VIGILANCIA&limit=100'
Assert-True (($generated.items | Where-Object { $_.source -eq 'RECURRENCE' }).Count -ge 1) 'geração da ocorrência'

$publicRaw = & curl.exe -s -X POST `
  -F 'category=MANUTENCAO' `
  -F 'location=Bloco de teste' `
  -F 'description=Chamado público criado pelo smoke test.' `
  -F 'contactName=Teste Local' `
  -F 'contactValue=sem contato' `
  "$base/api/public/requests"
$publicRequest = $publicRaw | ConvertFrom-Json
Assert-True ($publicRequest.protocol -like 'BLEXO-*') 'protocolo do chamado'

$requests = Invoke-Json GET '/api/requests'
Assert-True (($requests | Where-Object { $_.protocol -eq $publicRequest.protocol }).Count -eq 1) 'consulta do chamado'

$dashboard = Invoke-Json GET '/api/activities/dashboard'
[pscustomobject]@{
  Product = $me.product
  Version = $me.version
  Teams = $access.teams.Count
  Activity = $activity.id
  Recurrence = $recurrence.id
  Request = $publicRequest.protocol
  Rateio = $rateioSubmission.id
  Pending = $dashboard.pending
  Result = 'OK'
} | Format-List
