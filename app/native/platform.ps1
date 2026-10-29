$NexoPlatformCache = $null
function Get-PlatformInfo {
  if (-not $script:NexoPlatformCache) {
    $os=Get-CimInstance Win32_OperatingSystem
    $version=Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion'
    $build=[int]$version.CurrentBuildNumber
    $family='Windows no compatible'
    if ($os.Caption -match '\bWindows\s+(10|11)\b') { $family='Windows '+$Matches[1] }
    $supported=$os.ProductType -eq 1 -and (($family -eq 'Windows 10' -and $build -ge 10240 -and $build -lt 22000) -or ($family -eq 'Windows 11' -and $build -ge 22000))
    $script:NexoPlatformCache=@{ caption=[string]$os.Caption; family=$family; build=$build; productType=[int]$os.ProductType; displayVersion=[string]$version.DisplayVersion; architecture=[string]$os.OSArchitecture; supported=[bool]$supported; reason=if($supported){$null}else{'Solo se admiten Windows 10 y Windows 11 de escritorio. Otras versiones quedan en modo de consulta.'} }
  }
  return $script:NexoPlatformCache
}
function Assert-SupportedWindows {
  $platform=Get-PlatformInfo
  if (-not $platform.supported) { throw $platform.reason }
}
function Get-DeviceInfo {
  $chassis=@(Get-CimInstance Win32_SystemEnclosure -ErrorAction SilentlyContinue | ForEach-Object { $_.ChassisTypes })
  $computer=Get-CimInstance Win32_ComputerSystem -ErrorAction SilentlyContinue
  $mobile=@($chassis | Where-Object { $_ -in @(8,9,10,11,14,30,31,32) }).Count -gt 0 -or $computer.PCSystemType -eq 2
  $known=$null -ne $computer -or $chassis.Count -gt 0
  $power=Get-PowerSample
  return @{ kind=if($mobile){'laptop'}elseif($known){'desktop'}else{'unknown'}; isLaptop=[bool]$mobile; acConnected=$power.acConnected; batteryPercent=$power.batteryPercent }
}
function Get-PowerSample {
  $p=New-Object NexoNative+SYSTEM_POWER_STATUS
  $ok=[NexoNative]::GetSystemPowerStatus([ref]$p)
  return @{ acConnected=if(-not $ok -or $p.ACLineStatus -eq 255){$null}else{$p.ACLineStatus -eq 1}; batteryPercent=if(-not $ok -or $p.BatteryLifePercent -eq 255 -or $p.BatteryFlag -eq 128){$null}else{[int]$p.BatteryLifePercent} }
}
function Get-GamePreferenceSpecs($exe) {
  if (-not [IO.Path]::IsPathRooted([string]$exe) -or [IO.Path]::GetExtension([string]$exe) -ine '.exe') { throw 'Ejecutable de juego no valido.' }
  return @(
    @{ path='Software\Microsoft\DirectX\UserGpuPreferences'; name=[string]$exe; kind='String' },
    @{ path='Software\Microsoft\Windows NT\CurrentVersion\AppCompatFlags\Layers'; name=[string]$exe; kind='String' }
  )
}
function Get-GamePreferences($data) {
  Assert-SupportedWindows
  $platform=Get-PlatformInfo
  if($data.gpu -and $platform.build -lt 17134){throw 'La preferencia GPU requiere Windows 10 1803 o posterior.'}
  if($data.legacyFullscreen -and $platform.build -lt 15063){throw 'La preferencia de pantalla completa requiere Windows 10 1703 o posterior.'}
  $specs=@(Get-GamePreferenceSpecs $data.exe)
  $changes=@()
  if ($data.gpu) {
    $before=Get-RegistrySnapshot $specs[0]
    if($before.exists -and $before.kind -ne 'String'){throw 'Preferencia GPU existente no compatible.'}
    $text=[string]$before.value
    $tokens=@($text.Split(';') | Where-Object { $_ -and $_ -notmatch '^\s*GpuPreference\s*=' })
    $desired=($tokens + 'GpuPreference=2') -join ';';$desired+=';'
    $after=[ordered]@{path=$specs[0].path;name=$specs[0].name;keyExisted=$true;exists=$true;kind='String';value=$desired}
    $changes+=@{ id='gpu';before=@($before);after=@($after) }
  }
  if ($data.legacyFullscreen) {
    $before=Get-RegistrySnapshot $specs[1]
    if($before.exists -and $before.kind -ne 'String'){throw 'Preferencia de compatibilidad existente no compatible.'}
    $tokens=@(([string]$before.value).Split(' ') | Where-Object { $_ })
    if($tokens -notcontains '~'){$tokens=@('~')+$tokens}
    if($tokens -notcontains 'DISABLEDXMAXIMIZEDWINDOWEDMODE'){$tokens+='DISABLEDXMAXIMIZEDWINDOWEDMODE'}
    $after=[ordered]@{path=$specs[1].path;name=$specs[1].name;keyExisted=$true;exists=$true;kind='String';value=($tokens -join ' ')}
    $changes+=@{ id='legacyFullscreen';before=@($before);after=@($after) }
  }
  return $changes
}
function Write-GamePreference($data) {
  $specs=@(Get-GamePreferenceSpecs $data.exe)
  $index=if($data.preference -eq 'gpu'){0}elseif($data.preference -eq 'legacyFullscreen'){1}else{throw 'Preferencia no permitida.'}
  Write-RegistryValues @($data.value) @($specs[$index])
}
