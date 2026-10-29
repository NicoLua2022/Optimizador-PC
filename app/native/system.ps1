# System resources are resolved from the bundled catalogue. No shell command or path comes from UI input.
function Test-NexoAdmin {
  return ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}
function Get-CachedDevice {
  if (-not $script:NexoDeviceCache) { $script:NexoDeviceCache = Get-DeviceInfo }
  return $script:NexoDeviceCache
}
function Invoke-NexoCommand([string]$program, [string[]]$arguments) {
  $output = & (Join-Path "$env:SystemRoot\System32" $program) @arguments 2>&1
  if ($LASTEXITCODE -ne 0) { throw ('Windows rechazo '+$program+': '+(($output | Out-String).Trim()).Substring(0,[Math]::Min(350,($output | Out-String).Trim().Length))) }
  return ($output | Out-String)
}
function Copy-NexoObject($value) { return ($value | ConvertTo-Json -Depth 20 -Compress | ConvertFrom-Json) }
function New-Resource([string]$type, [string]$key, $target, $state) {
  return [ordered]@{ type=$type; key=$key; target=$target; state=$state }
}
function Get-PhysicalAdapters {
  return @(Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { $_.Status -eq 'Up' -and $_.InterfaceGuid })
}
function Find-Adapter($target) {
  $adapter = Get-NetAdapter -Physical -ErrorAction Stop | Where-Object { ([guid]$_.InterfaceGuid).ToString() -eq [string]$target.guid } | Select-Object -First 1
  if (-not $adapter) { throw 'El adaptador original ya no esta disponible. Se conserva su copia.' }
  return $adapter
}
function Set-NexoDnsV4($adapter,$state) {
  # Bind the setter to the IPv4 CIM object so IPv6 is never selected implicitly.
  $ipv4=Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop
  if(-not $ipv4){throw 'El adaptador no expone configuracion DNS IPv4.'}
  if($state.static){Set-DnsClientServerAddress -InputObject $ipv4 -ServerAddresses @($state.servers) -ErrorAction Stop|Out-Null}
  else{Set-DnsClientServerAddress -InputObject $ipv4 -ResetServerAddresses -ErrorAction Stop|Out-Null}
}
function Read-ServiceState([string]$name) {
  $service = Get-Service -Name $name -ErrorAction SilentlyContinue
  if (-not $service) { return $null }
  $start = Get-RegistrySnapshot @{ hive='LocalMachine';path="SYSTEM\CurrentControlSet\Services\$name";name='Start' }
  $delayed = Get-RegistrySnapshot @{ hive='LocalMachine';path="SYSTEM\CurrentControlSet\Services\$name";name='DelayedAutoStart' }
  if (-not $start.exists -or [int]$start.value -notin @(2,3,4)) { throw 'El servicio no expone un inicio compatible.' }
  if ($service.Status -notin @('Running','Stopped')) { throw 'Un servicio esta cambiando de estado. Espera y vuelve a leer.' }
  return [ordered]@{ start=[int]$start.value; delayed=$delayed; running=($service.Status -eq 'Running') }
}
function Read-PowerSetting($target) {
  $text = Invoke-NexoCommand 'powercfg.exe' @('/qh',[string]$target.scheme,[string]$target.subgroup,[string]$target.setting)
  $indexes = @([regex]::Matches($text,'0x[0-9a-fA-F]+') | ForEach-Object { [Convert]::ToUInt32($_.Value.Substring(2),16) })
  if ($indexes.Count -lt 2) { throw 'El firmware no expone valores de energia legibles.' }
  return [ordered]@{ ac=[long]$indexes[-2]; dc=[long]$indexes[-1] }
}
function Read-BootState([string]$name) {
  # Refuse BCD changes with active BitLocker protection; never suspend encryption or Secure Boot.
  if (-not (Get-Command Get-BitLockerVolume -ErrorAction SilentlyContinue)) { throw 'No se pudo comprobar BitLocker; no se modificara BCD.' }
  $volume = Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
  if (-not $volume -or [int]$volume.ProtectionStatus -ne 0) { throw 'BCD bloqueado: BitLocker activo o estado sin confirmar. No se suspende la proteccion.' }
  $text = Invoke-NexoCommand 'bcdedit.exe' @('/enum','{current}')
  $line = [regex]::Match($text, ('(?mi)^\s*'+[regex]::Escape($name)+'\s+(\S+)\s*$'))
  if (-not $line.Success) { return @{ exists=$false; value=$null } }
  $raw = $line.Groups[1].Value.ToLowerInvariant()
  $normalized = if ($raw -in @('yes','true','si','sí','ja','oui')) {'yes'} elseif ($raw -in @('no','false','nein','non')) {'no'} else {throw 'Valor BCD no reconocible. Se conserva.'}
  return @{ exists=$true; value=$normalized }
}
function Read-Hibernation {
  $items = @()
  foreach ($name in @('HibernateEnabled','HiberFileType','HiberFileSizePercent')) {
    $items += Get-RegistrySnapshot @{hive='LocalMachine';path='SYSTEM\CurrentControlSet\Control\Power';name=$name}
  }
  $items += Get-RegistrySnapshot @{hive='LocalMachine';path='SYSTEM\CurrentControlSet\Control\Session Manager\Power';name='HiberbootEnabled'}
  if (-not $items[0].exists -or [int]$items[0].value -notin @(0,1)) { throw 'No se pudo identificar el estado de hibernacion.' }
  if ([int]$items[0].value -eq 1 -and (-not $items[1].exists -or [int]$items[1].value -notin @(1,2))) { throw 'El modo de hibernacion no se puede restaurar de forma fiable en esta instalacion.' }
  return @{ enabled=([int]$items[0].value -eq 1); settings=$items }
}
function Get-ResourcePairs($spec) {
  $pairs = @()
  switch ([string]$spec.type) {
    'service' {
      $state = Read-ServiceState $spec.name
      if ($null -ne $state) {
        $before = New-Resource 'service' ('service:'+ $spec.name) @{name=$spec.name} $state
        $after = Copy-NexoObject $before; $after.state.start=4; $after.state.running=$false
        $pairs += @{before=$before;after=$after}
      }
    }
    {$_ -in @('task','nvidiaTasks')} {
      $tasks = if ($spec.type -eq 'task') {
        $pos = $spec.name.LastIndexOf('\'); Get-ScheduledTask -TaskPath $spec.name.Substring(0,$pos+1) -TaskName $spec.name.Substring($pos+1) -ErrorAction SilentlyContinue
      } else {
        Get-ScheduledTask -TaskPath '\' -ErrorAction SilentlyContinue | Where-Object { $_.TaskName -match '^NvTm(Rep|Mon)' }
      }
      foreach ($task in @($tasks | Sort-Object TaskPath,TaskName)) {
        if (-not $task) { continue }
        $before = New-Resource 'task' ('task:'+ $task.TaskPath+$task.TaskName) @{path=$task.TaskPath;name=$task.TaskName} @{enabled=[bool]$task.Settings.Enabled}
        $after=Copy-NexoObject $before; $after.state.enabled=$false; $pairs+=@{before=$before;after=$after}
      }
    }
    'powerSetting' {
      $scheme=Get-ActivePlan
      $target=@{scheme=$scheme;subgroup=[string]$spec.subgroup;setting=[string]$spec.setting}
      $before=New-Resource 'powerSetting' ('power:'+ $scheme+':'+$spec.setting) $target (Read-PowerSetting $target)
      $after=Copy-NexoObject $before;$after.state.ac=[long]$spec.value;$pairs+=@{before=$before;after=$after}
    }
    'dedicatedPlan' {
      $guid='923e244d-07e1-47b1-a24e-9ee41b46a803'
      $list=Invoke-NexoCommand 'powercfg.exe' @('/list')
      $exists=$list -match [regex]::Escape($guid);$active=Get-ActivePlan
      if ($exists -and $active -ne $guid) { throw 'Ya existe un plan NEXO. Restaura el cambio anterior antes de crear otro.' }
      $source=if($list -match 'e9a42b02-d5df-448d-aa00-03f14749eb61'){'e9a42b02-d5df-448d-aa00-03f14749eb61'}elseif($list -match '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'){'8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'}else{$null}
      if (-not $source -and -not $exists) { throw 'Windows no ofrece un plan de rendimiento para duplicar. Se conserva el plan OEM/Modern Standby.' }
      $before=New-Resource 'dedicatedPlan' 'plan:nexo' @{guid=$guid;source=$source} @{active=$active;exists=[bool]$exists}
      $after=Copy-NexoObject $before;$after.state.active=$guid;$after.state.exists=$true;$pairs+=@{before=$before;after=$after}
    }
    'boot' {
      $before=New-Resource 'boot' ('boot:'+ $spec.name) @{name=$spec.name} (Read-BootState $spec.name)
      $after=Copy-NexoObject $before;$after.state.exists=($null -ne $spec.value);$after.state.value=$spec.value;$pairs+=@{before=$before;after=$after}
    }
    'memoryCompression' {
      $agent=Get-MMAgent -ErrorAction Stop
      $before=New-Resource 'memoryCompression' 'memory:compression' @{} @{enabled=[bool]$agent.MemoryCompression}
      $after=Copy-NexoObject $before;$after.state.enabled=$false;$pairs+=@{before=$before;after=$after}
    }
    'hibernate' {
      $before=New-Resource 'hibernate' 'power:hibernate' @{} (Read-Hibernation)
      $after=Copy-NexoObject $before;$after.state.enabled=$false
      foreach($s in $after.state.settings){if($s.name -in @('HibernateEnabled','HiberbootEnabled')){$s.exists=$true;$s.kind='DWord';$s.value=0;$s.keyExisted=$true}}
      $pairs+=@{before=$before;after=$after}
    }
    {$_ -in @('gpuMsi','serviceHost','tcpNagle')} {
      $specs=@()
      if ($spec.type -eq 'gpuMsi') {
        $devices=@(Get-PnpDevice -Class Display -PresentOnly -ErrorAction Stop | Where-Object { $_.InstanceId -match '^PCI\\VEN_10DE&' } | Sort-Object InstanceId)
        foreach($device in $devices){
          $v=@{hive='LocalMachine';path=('SYSTEM\CurrentControlSet\Enum\'+$device.InstanceId+'\Device Parameters\Interrupt Management\MessageSignaledInterruptProperties');name='MSISupported';kind='DWord';value=1}
          $snapshot=Get-RegistrySnapshot $v
          if($snapshot.exists -and $snapshot.kind -eq 'DWord'){$specs+=$v}
        }
      } elseif ($spec.type -eq 'serviceHost') {
        $ram=(Get-CimInstance Win32_ComputerSystem -ErrorAction Stop).TotalPhysicalMemory
        if(-not $ram){throw 'No se pudo medir la RAM instalada.'}
        $specs+=@{hive='LocalMachine';path='SYSTEM\CurrentControlSet\Control';name='SvcHostSplitThresholdInKB';kind='DWord';value=[int][Math]::Min(2147483647,[Math]::Max(3670016,$ram/1KB))}
      } else {
        foreach($adapter in (Get-PhysicalAdapters)){
          $ipv4=Get-NetIPAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object {$_.IPAddress -notmatch '^(169\.254\.|127\.|0\.)'}
          if(-not $ipv4){continue}
          $path='SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{'+([guid]$adapter.InterfaceGuid).ToString()+'}'
          foreach($name in @('TcpAckFrequency','TCPNoDelay')){$specs+=@{hive='LocalMachine';path=$path;name=$name;kind='DWord';value=1}}
        }
      }
      foreach($v in $specs){
        $state=Get-RegistrySnapshot $v
        $before=New-Resource 'registry' ('reg:'+ $v.hive+':'+$v.path+':'+$v.name) $v $state
        $after=Copy-NexoObject $before;$after.state.exists=$true;$after.state.keyExisted=$true;$after.state.kind=$v.kind;$after.state.value=$v.value
        $pairs+=@{before=$before;after=$after}
      }
    }
    'dns' {
      foreach($adapter in (Get-PhysicalAdapters | Sort-Object InterfaceGuid)){
        $guid=([guid]$adapter.InterfaceGuid).ToString();$path='SYSTEM\CurrentControlSet\Services\Tcpip\Parameters\Interfaces\{'+$guid+'}'
        $original=Get-RegistrySnapshot @{hive='LocalMachine';path=$path;name='NameServer'}
        $servers=@((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4 -ErrorAction Stop).ServerAddresses)
        $static=-not [string]::IsNullOrWhiteSpace([string]$original.value)
        $before=New-Resource 'dns' ('dns:'+ $guid) @{guid=$guid} @{static=$static;servers=if($static){$servers}else{@()};registry=$original}
        $after=Copy-NexoObject $before;$after.state.static=$true;$after.state.servers=@('1.1.1.1','1.0.0.1');$after.state.registry.exists=$true;$after.state.registry.keyExisted=$true;$after.state.registry.kind='String';$after.state.registry.value='1.1.1.1,1.0.0.1'
        $pairs+=@{before=$before;after=$after}
      }
    }
    'adapterPower' {
      if(-not (Get-Command Set-NetAdapterPowerManagement -ErrorAction Stop).Parameters.ContainsKey('NoRestart')){throw 'El controlador no permite cambiar esta opcion sin reiniciar la red.'}
      foreach($adapter in (Get-PhysicalAdapters | Sort-Object InterfaceGuid)){
        $pm=Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction SilentlyContinue
        if(-not $pm -or [string]$pm.AllowComputerToTurnOffDevice -notin @('Enabled','Disabled')){continue}
        $guid=([guid]$adapter.InterfaceGuid).ToString()
        $before=New-Resource 'adapterPower' ('adapter-power:'+ $guid) @{guid=$guid} @{allow=[string]$pm.AllowComputerToTurnOffDevice}
        $after=Copy-NexoObject $before;$after.state.allow='Disabled';$pairs+=@{before=$before;after=$after}
      }
    }
    default { throw 'Tipo de recurso no permitido.' }
  }
  return $pairs
}
function Get-SystemPairs($definition) {
  $pairs=@()
  foreach($spec in $definition.resources){$pairs+=@(Get-ResourcePairs $spec)}
  if(-not $pairs.Count){throw 'No se encontraron componentes o preferencias compatibles instalados.'}
  return $pairs
}
function Convert-NexoCanonical($object) {
  if ($null -eq $object) { return $null }
  if ($object -is [System.Collections.IDictionary] -or $object.GetType() -eq [System.Management.Automation.PSCustomObject]) {
    $result=[ordered]@{}
    $names=if($object -is [System.Collections.IDictionary]){@($object.Keys)}else{@($object.PSObject.Properties.Name)}
    foreach($name in ($names|Sort-Object)){$result[$name]=Convert-NexoCanonical $object.$name}
    return $result
  }
  if($object -is [array]){return ,@($object|ForEach-Object{Convert-NexoCanonical $_})}
  return $object
}
function Test-ResourceEqual($left,$right) {
  return (ConvertTo-Json -InputObject (Convert-NexoCanonical $left) -Depth 25 -Compress) -ceq (ConvertTo-Json -InputObject (Convert-NexoCanonical $right) -Depth 25 -Compress)
}
function Get-SystemInspection($definition) {
  $pairs=@(Get-SystemPairs $definition)
  $configured=$true
  foreach($p in $pairs){if(-not (Test-ResourceEqual $p.before.state $p.after.state)){$configured=$false}}
  return @{id=$definition.id;available=$true;reason=$null;configured=$configured;before=@($pairs|ForEach-Object{$_.before});after=@($pairs|ForEach-Object{$_.after})}
}
function Write-SystemTweak($definition,$data) {
  if(-not (Test-NexoAdmin)){throw 'Este ajuste requiere ejecutar NEXO como administrador.'}
  # Resolve actual hardware again; restored entries must still identify the exact original component.
  $allowed=@{}
  if($data.restoring -and @($definition.resources|Where-Object type -in @('powerSetting','dedicatedPlan')).Count){
    foreach($entry in @($data.value)){
      if($entry.type -eq 'powerSetting'){
        $spec=$definition.resources|Where-Object {$_.type -eq 'powerSetting' -and $_.subgroup -ceq $entry.target.subgroup -and $_.setting -ceq $entry.target.setting}|Select-Object -First 1
        if(-not $spec){throw 'Parametro de energia no permitido.'}
        [void][guid]::Parse([string]$entry.target.scheme)
        [void](Read-PowerSetting $entry.target)
      }elseif($entry.type -eq 'dedicatedPlan' -and $entry.target.guid -eq '923e244d-07e1-47b1-a24e-9ee41b46a803'){
        [void][guid]::Parse([string]$entry.state.active)
      }else{throw 'Copia de energia no permitida.'}
      $allowed[$entry.key]=$entry
    }
  }else{
    $pairs=@(Get-SystemPairs $definition);foreach($p in $pairs){$allowed[$p.before.key]=$p.before}
  }
  $values=@($data.value)
  if(-not $values.Count -or $values.Count -gt 128){throw 'Copia de recursos no valida.'}
  foreach($entry in $values){
    if(-not $allowed.ContainsKey([string]$entry.key) -or $allowed[$entry.key].type -cne $entry.type){throw 'El componente original no coincide. No se modificara otro dispositivo.'}
    $current=$allowed[$entry.key]
    # Compare stable target identifiers, not labels or transient adapter indexes.
    if($entry.type -ne 'dedicatedPlan' -and -not (Test-ResourceEqual $current.target $entry.target)){throw 'El destino original ya no coincide.'}
  }
  foreach($entry in $values){
    $target=$entry.target;$state=$entry.state
    switch($entry.type){
      'registry' { [void](Write-RegistryValues @($state) @($target)) }
      'service' {
        $service=Get-Service -Name $target.name -ErrorAction Stop
        if(-not $state.running -and $service.Status -ne 'Stopped'){
          if(@($service.DependentServices|Where-Object Status -eq 'Running').Count){throw 'El servicio tiene dependencias activas. No se detendran otros servicios.'}
          Stop-Service -Name $target.name -ErrorAction Stop
        }
        $mode=switch([int]$state.start){2{'auto'}3{'demand'}4{'disabled'}default{throw 'Inicio de servicio no permitido.'}}
        [void](Invoke-NexoCommand 'sc.exe' @('config',[string]$target.name,'start=',$mode))
        [void](Write-RegistryValues @($state.delayed) @($state.delayed))
        if($state.running){Start-Service -Name $target.name -ErrorAction Stop}
        if(-not (Test-ResourceEqual (Read-ServiceState $target.name) $state)){throw 'Windows no aplico el estado completo del servicio.'}
      }
      'task' {
        if($state.enabled){Enable-ScheduledTask -TaskPath $target.path -TaskName $target.name -ErrorAction Stop|Out-Null}else{Disable-ScheduledTask -TaskPath $target.path -TaskName $target.name -ErrorAction Stop|Out-Null}
        if([bool](Get-ScheduledTask -TaskPath $target.path -TaskName $target.name).Settings.Enabled -ne [bool]$state.enabled){throw 'No se pudo verificar la tarea.'}
      }
      'powerSetting' {
        if(-not $data.restoring -and (Get-ActivePlan) -ne $target.scheme){throw 'El plan activo cambio antes de escribir.'}
        [void](Invoke-NexoCommand 'powercfg.exe' @('/setacvalueindex',[string]$target.scheme,[string]$target.subgroup,[string]$target.setting,[string]$state.ac))
        # DC is never changed, including restoration; preserve battery choices made outside NEXO.
        if((Get-ActivePlan) -eq $target.scheme){[void](Invoke-NexoCommand 'powercfg.exe' @('/setactive',[string]$target.scheme))}
        if((Read-PowerSetting $target).ac -ne $state.ac){throw 'El plan no guardo el indice AC solicitado.'}
      }
      'dedicatedPlan' {
        $list=Invoke-NexoCommand 'powercfg.exe' @('/list')
        if($state.exists -and $list -notmatch [regex]::Escape([string]$target.guid)){
          if(-not $target.source){throw 'No hay un plan de origen compatible.'}
          [void](Invoke-NexoCommand 'powercfg.exe' @('/duplicatescheme',[string]$target.source,[string]$target.guid))
          [void](Invoke-NexoCommand 'powercfg.exe' @('/changename',[string]$target.guid,'NEXO Rendimiento'))
        }
        [void](Invoke-NexoCommand 'powercfg.exe' @('/setactive',[string]$state.active))
        if(-not $state.exists -and $list -match [regex]::Escape([string]$target.guid)){[void](Invoke-NexoCommand 'powercfg.exe' @('/delete',[string]$target.guid))}
        if((Get-ActivePlan) -ne $state.active){throw 'El plan activo no coincide.'}
        $list=Invoke-NexoCommand 'powercfg.exe' @('/list');if(($list -match [regex]::Escape([string]$target.guid)) -ne [bool]$state.exists){throw 'No se verifico la copia del plan.'}
      }
      'boot' {
        $current=Read-BootState $target.name
        if($state.exists){if($state.value -notin @('yes','no')){throw 'Valor BCD no permitido.'};[void](Invoke-NexoCommand 'bcdedit.exe' @('/set','{current}',[string]$target.name,[string]$state.value))}
        elseif($current.exists){[void](Invoke-NexoCommand 'bcdedit.exe' @('/deletevalue','{current}',[string]$target.name))}
        if(-not (Test-ResourceEqual (Read-BootState $target.name) $state)){throw 'BCD no coincide con la configuracion solicitada.'}
      }
      'memoryCompression' {
        if($state.enabled){Enable-MMAgent -MemoryCompression -ErrorAction Stop}else{Disable-MMAgent -MemoryCompression -ErrorAction Stop}
        if([bool](Get-MMAgent).MemoryCompression -ne [bool]$state.enabled){throw 'Windows no aplico el estado de compresion.'}
      }
      'hibernate' {
        [void](Invoke-NexoCommand 'powercfg.exe' @('/hibernate',$(if($state.enabled){'on'}else{'off'})))
        if($state.enabled){
          $mode=$state.settings|Where-Object name -eq 'HiberFileType';$size=$state.settings|Where-Object name -eq 'HiberFileSizePercent'
          if($mode.exists -and [int]$mode.value -in @(1,2)){[void](Invoke-NexoCommand 'powercfg.exe' @('/hibernate','/type',$(if([int]$mode.value -eq 1){'reduced'}else{'full'})))}
          if($size.exists -and [int]$size.value -ge 40 -and [int]$size.value -le 100){[void](Invoke-NexoCommand 'powercfg.exe' @('/hibernate','/size',[string]$size.value))}
        }
        [void](Write-RegistryValues @($state.settings) @($state.settings))
        if(-not (Test-ResourceEqual (Read-Hibernation) $state)){throw 'No se verifico la configuracion de hibernacion.'}
      }
      'dns' {
        $adapter=Find-Adapter $target
        Set-NexoDnsV4 $adapter $state
        # Preserve exact NameServer representation as well as DHCP/static mode.
        [void](Write-RegistryValues @($state.registry) @($state.registry))
        $actual=@((Get-DnsClientServerAddress -InterfaceIndex $adapter.ifIndex -AddressFamily IPv4).ServerAddresses)
        if($state.static -and ($actual -join ',') -ne (@($state.servers) -join ',')){throw 'El adaptador no aplico los DNS.'}
      }
      'adapterPower' {
        if($state.allow -notin @('Enabled','Disabled')){throw 'Estado de energia del adaptador no permitido.'}
        $adapter=Find-Adapter $target;$pm=Get-NetAdapterPowerManagement -Name $adapter.Name -ErrorAction Stop
        $pm.AllowComputerToTurnOffDevice=$state.allow
        $pm|Set-NetAdapterPowerManagement -NoRestart -ErrorAction Stop|Out-Null
        if([string](Get-NetAdapterPowerManagement -Name $adapter.Name).AllowComputerToTurnOffDevice -cne $state.allow){throw 'No se verifico el estado del adaptador.'}
      }
      default {throw 'Recurso no permitido.'}
    }
  }
  return $true
}
