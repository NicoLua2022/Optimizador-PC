# Definitions are embedded from the bundled catalogue by the Node backend, never supplied by the renderer.
$NexoDefinitions = $null
function Get-Definitions {
  if (-not $script:NexoDefinitions) {
    $decoded = ConvertFrom-Json -InputObject ([Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('__NEXO_CATALOG__')))
    $script:NexoDefinitions = @()
    foreach ($item in $decoded) { $script:NexoDefinitions += $item }
  }
  foreach ($item in $script:NexoDefinitions) { Write-Output $item }
}
function Get-Definition([string]$id) {
  foreach ($definition in (Get-Definitions)) { if ($definition.id -ceq $id) { return $definition } }
  throw 'Ajuste no permitido.'
}
function Get-RegistrySnapshot($spec) {
  $root = Get-RegistryRoot $spec
  $key = $root.OpenSubKey([string]$spec.path)
  try {
    $exists = $key -and ($key.GetValueNames() -contains [string]$spec.name)
    $kind = $null; $value = $null
    if ($exists) {
      $kind = $key.GetValueKind([string]$spec.name).ToString()
      if ($kind -notin @('DWord','String')) { throw 'El valor existente tiene un tipo no compatible. Se conserva sin modificar.' }
      $value = $key.GetValue([string]$spec.name, $null, [Microsoft.Win32.RegistryValueOptions]::DoNotExpandEnvironmentNames)
    }
    $snapshot = [ordered]@{ path=[string]$spec.path; name=[string]$spec.name; keyExisted=[bool]$key; exists=[bool]$exists; kind=$kind; value=$value }
    if ($spec.hive) { $snapshot.hive = [string]$spec.hive }
    return $snapshot
  } finally { if ($key) { $key.Dispose() } }
}
function Get-RegistryRoot($spec) {
  if (-not $spec.hive -or $spec.hive -eq 'CurrentUser') { return [Microsoft.Win32.Registry]::CurrentUser }
  if ($spec.hive -eq 'LocalMachine') { return [Microsoft.Win32.Registry]::LocalMachine }
  throw 'Colmena de registro no permitida.'
}
function Get-TweakInspection($definition, [string]$scope = 'general') {
  $platform=Get-PlatformInfo
  $build=$platform.build
  $reason=if($platform.supported){$null}else{$platform.reason}
  if($definition.windows -and $platform.family -notin @($definition.windows)){$reason='Este ajuste corresponde a otra version de Windows.'}
  if ($build -lt $definition.minBuild -or ($definition.maxBuild -and $build -gt $definition.maxBuild)) { $reason = 'No disponible en esta compilacion de Windows.' }
  if (-not $reason -and $definition.admin -and -not (Test-NexoAdmin)) { $reason = 'Requiere administrador. Cierra NEXO y ejecutalo como administrador para estos ajustes.' }
  if (-not $reason -and $definition.energy) {
    $device = Get-CachedDevice
    if ($device.isLaptop -and $scope -ne 'laptop') { $reason = 'Gestiona esta opcion de energia desde la pestana Laptop.' }
    if ($device.acConnected -ne $true) { $reason = 'Conecta la alimentacion AC antes de cambiar esta opcion energetica.' }
  }
  if ($definition.policy) {
    foreach ($hive in @([Microsoft.Win32.Registry]::CurrentUser,[Microsoft.Win32.Registry]::LocalMachine)) {
      $policy = $hive.OpenSubKey([string]$definition.policy.path)
      try { if ($policy -and $policy.GetValueNames() -contains [string]$definition.policy.name) { $reason = 'Esta preferencia esta administrada por una politica del equipo.' } }
      finally { if ($policy) { $policy.Dispose() } }
    }
  }
  $before = @(); $after = @(); $configured = $true
  if (-not $reason -and $definition.resources) {
    try { return Get-SystemInspection $definition }
    catch { $reason = $_.Exception.Message }
  }
  if (-not $reason) {
    try {
      foreach ($spec in $definition.values) {
        $original = Get-RegistrySnapshot $spec
        if ($definition.requireExisting -and -not $original.exists) { throw 'Windows no expone esta preferencia en tu perfil.' }
        $desired = $spec.value
        if ($null -ne $spec.clearBits) {
          [int]$flags = 0
          if (-not [int]::TryParse([string]$original.value, [ref]$flags) -or $flags -lt 0) { throw 'Las opciones de accesibilidad existentes no son compatibles.' }
          $desired = ($flags -band (-bnot [int]$spec.clearBits)).ToString([Globalization.CultureInfo]::InvariantCulture)
        }
        if ($spec.mergeToken) {
          if($original.exists -and $original.kind -ne 'String'){throw 'Preferencia grafica no compatible.'}
          $tokens=@(([string]$original.value).Split(';') | Where-Object { $_ -and $_ -notmatch ('^\s*'+[regex]::Escape([string]$spec.mergeToken.name)+'\s*=') })
          $desired=(($tokens+([string]$spec.mergeToken.name+'='+[string]$spec.mergeToken.value)) -join ';')+';'
        }
        $before += $original
        $next = [ordered]@{ path=[string]$spec.path; name=[string]$spec.name; keyExisted=$true; exists=$true; kind=[string]$spec.kind; value=$desired }
        if ($spec.hive) { $next.hive = [string]$spec.hive }
        $after += $next
        if (-not $original.exists -or $original.kind -ne $spec.kind -or [string]$original.value -cne [string]$desired) { $configured = $false }
      }
    } catch { $reason = $_.Exception.Message }
  }
  return @{ id=$definition.id; available=(-not [bool]$reason); reason=$reason; configured=($configured -and -not [bool]$reason); before=$before; after=$after }
}
function Write-Tweak($data) {
  $definition = Get-Definition ([string]$data.tweakId)
  if (-not $data.restoring) {
    try {
      $inspection = Get-TweakInspection $definition ([string]$data.scope)
      if (-not $inspection.available) { throw $inspection.reason }
      if (-not $data.expectedBefore -or -not (Test-ResourceEqual @($data.expectedBefore) @($inspection.before))) { throw 'Windows cambio antes de escribir. No se aplica ni se revierte este ajuste.' }
      if (-not (Test-ResourceEqual @($data.value) @($inspection.after))) { throw 'El estado o el destino cambio. Revisa nuevamente el ajuste.' }
      if ($definition.energy -and (Get-PowerSample).acConnected -ne $true) { throw 'Se desconecto la alimentacion AC. No se aplica este ajuste.' }
    } catch {
      $_.Exception.Data['NexoUnchanged']=$true; throw
    }
  }
  if ($definition.resources) { return Write-SystemTweak $definition $data }
  Write-RegistryValues @($data.value) @($definition.values)
}
function Write-RegistryValues($entries,$specifications) {
  $values=@($entries)
  $specs=@($specifications)
  if ($values.Count -ne $specs.Count) { throw 'Copia de restauracion no valida.' }
  for ($i=0; $i -lt $values.Count; $i++) {
    $entry = $values[$i]; $spec = $specs[$i]
    if ($entry.path -cne $spec.path -or $entry.name -cne $spec.name -or [string]$entry.hive -cne [string]$spec.hive) { throw 'La copia no corresponde al ajuste permitido.' }
    if ($entry.exists -and $entry.kind -notin @('DWord','String')) { throw 'Tipo de registro no permitido.' }
  }
  foreach ($entry in $values) {
    $root = Get-RegistryRoot $entry
    if ($entry.exists) {
      $key = $root.CreateSubKey([string]$entry.path)
      try {
        $value = $entry.value
        if ($entry.kind -eq 'DWord') { $value = [int]$value } else { $value = [string]$value }
        $key.SetValue([string]$entry.name, $value, [Microsoft.Win32.RegistryValueKind]([string]$entry.kind))
        $key.Flush()
      } finally { $key.Dispose() }
    } else {
      $key = $root.OpenSubKey([string]$entry.path, $true)
      if ($key) {
        try { $key.DeleteValue([string]$entry.name, $false); $key.Flush() }
        finally { $key.Dispose() }
      }
    }
  }
  # Delete only an empty leaf that did not exist before. Never delete a tree or other values.
  foreach ($entry in $values) {
    $root = Get-RegistryRoot $entry
    if (-not $entry.keyExisted) {
      $key = $root.OpenSubKey([string]$entry.path)
      if ($key) {
        try { $empty = $key.ValueCount -eq 0 -and $key.SubKeyCount -eq 0 } finally { $key.Dispose() }
        if ($empty) { $root.DeleteSubKey([string]$entry.path, $false) }
      }
    }
  }
  foreach ($entry in $values) {
    $actual = Get-RegistrySnapshot $entry
    if ($actual.exists -ne $entry.exists -or ($entry.exists -and ($actual.kind -ne $entry.kind -or [string]$actual.value -cne [string]$entry.value))) { throw 'Windows no guardo o no restauro el valor solicitado.' }
  }
  return $true
}
