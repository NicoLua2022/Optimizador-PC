$NexoAppGroups = @{
 'apps-news'=@('Microsoft.BingNews','Microsoft.BingWeather','Microsoft.WindowsMaps','Microsoft.Getstarted','Microsoft.GetHelp','Microsoft.WindowsFeedbackHub')
 'apps-office'=@('Microsoft.MicrosoftOfficeHub','Microsoft.Todos','Microsoft.PowerAutomateDesktop','Clipchamp.Clipchamp','MicrosoftTeams','MSTeams','Microsoft.SkypeApp','Microsoft.People','Microsoft.Copilot')
 'apps-sponsored'=@('king.com.*','Microsoft.MicrosoftSolitaireCollection','BytedancePte.Ltd.TikTok','Facebook.*','Disney.*','AmazonVideo.PrimeVideo')
 'apps-legacy'=@('Microsoft.549981C3F5F10','Microsoft.Microsoft3DViewer','Microsoft.MixedReality.Portal','Microsoft.Wallet')
}
function Get-CleanupRoots([string]$tool) {
  if($tool -eq 'temp'){
    $roots=@(@{path=(Join-Path $env:LOCALAPPDATA 'Temp');days=3},@{path=(Join-Path $env:LOCALAPPDATA 'CrashDumps');days=7})
    if(Test-NexoAdmin){$roots+=@{path=(Join-Path $env:SystemRoot 'Temp');days=3}}
    return $roots
  }
  if($tool -eq 'shader'){return @(@{path=(Join-Path $env:LOCALAPPDATA 'D3DSCache');days=0},@{path=(Join-Path $env:LOCALAPPDATA 'NVIDIA\DXCache');days=0},@{path=(Join-Path $env:LOCALAPPDATA 'NVIDIA\GLCache');days=0})}
  throw 'Limpieza no permitida.'
}
function Test-SafeCleanupPath([string]$path,[string]$root) {
  $root=[IO.Path]::GetFullPath($root).TrimEnd('\');$full=[IO.Path]::GetFullPath($path)
  if(-not $full.StartsWith($root+'\',[StringComparison]::OrdinalIgnoreCase)){return $false}
  $current=Get-Item -LiteralPath $full -Force -ErrorAction SilentlyContinue
  if(-not $current -or $current.PSIsContainer){return $false}
  while($current -and $current.FullName.Length -ge $root.Length){
    if($current.Attributes -band [IO.FileAttributes]::ReparsePoint){return $false}
    if($current.FullName -ieq $root){return $true}
    $current=if($current -is [IO.DirectoryInfo]){$current.Parent}else{$current.Directory}
  }
  return $false
}
function Get-CleanupFiles([string]$tool) {
  $result=New-Object 'System.Collections.Generic.List[object]'
  foreach($root in (Get-CleanupRoots $tool)){
    if(-not (Test-Path -LiteralPath $root.path)){continue}
    $stack=New-Object 'System.Collections.Generic.Stack[string]';$stack.Push($root.path)
    while($stack.Count -and $result.Count -lt 5000){
      $dir=$stack.Pop();$info=Get-Item -LiteralPath $dir -Force -ErrorAction SilentlyContinue
      if(-not $info -or ($info.Attributes -band [IO.FileAttributes]::ReparsePoint)){continue}
      foreach($file in @(Get-ChildItem -LiteralPath $dir -Force -ErrorAction SilentlyContinue)){
        if($file.Attributes -band [IO.FileAttributes]::ReparsePoint){continue}
        if($file.PSIsContainer){$stack.Push($file.FullName);continue}
        if($file.LastWriteTimeUtc -gt [DateTime]::UtcNow.AddDays(-[int]$root.days)){continue}
        if($result.Count -ge 5000){break}
        $result.Add(@{id=$file.FullName;name=$file.Name;path=$file.FullName;root=$root.path;bytes=[long]$file.Length;modified=$file.LastWriteTimeUtc.Ticks.ToString();kind='file'})
      }
    }
  }
  return @($result.ToArray()|Sort-Object path)
}
function Get-BackgroundApps {
  [uint32]$foreground=0;[void][NexoNative]::GetWindowThreadProcessId([NexoNative]::GetForegroundWindow(),[ref]$foreground)
  $names=@('OneDrive','Teams','ms-teams','msedge','chrome','firefox','PhoneExperienceHost','YourPhone','Widgets','Cortana','SkypeApp','GoogleDriveFS','Dropbox','Copilot','Discord','Spotify')
  return @(foreach($p in @(Get-Process -ErrorAction SilentlyContinue|Where-Object{$_.ProcessName -in $names -and $_.Id -ne $foreground -and $_.MainWindowHandle -ne [IntPtr]::Zero}|Sort-Object Id)){
    try{if(Test-Owned $p.Id){@{id=([string]$p.Id);pid=$p.Id;name=$p.ProcessName;started=$p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture);bytes=[long]$p.WorkingSet64;kind='process'}}}catch{continue}
  })
}
function Get-RemovableApps([string]$group) {
  if(-not $NexoAppGroups.ContainsKey($group)){throw 'Grupo de aplicaciones no permitido.'}
  $patterns=$NexoAppGroups[$group]
  return @(foreach($app in @(Get-AppxPackage -ErrorAction Stop|Sort-Object PackageFullName)){
    if($app.IsFramework -or $app.NonRemovable -or $app.Name -match '(?i)WindowsStore|DesktopAppInstaller|Xbox|GamingServices|SecHealth|VCLibs|NET.Native|UI.Xaml'){continue}
    foreach($pattern in $patterns){if($app.Name -like $pattern){@{id=$app.PackageFullName;name=$app.Name;version=[string]$app.Version;kind='app'};break}}
  })
}
function Inspect-NexoTool([string]$tool) {
  Assert-SupportedWindows
  $items=switch($tool){
    {$_ -in @('temp','shader')} {Get-CleanupFiles $tool}
    'background' {Get-BackgroundApps}
    { $NexoAppGroups.ContainsKey($_) } {Get-RemovableApps $tool}
    'flush-dns' {@{id='flush-dns';name='Cache DNS de Windows';kind='action'}}
    'explorer' {@{id='explorer';name='Escritorio y barra de tareas de esta sesion';kind='action'}}
    default {throw 'Herramienta no permitida.'}
  }
  return ,@($items)
}
function Invoke-NexoTool($data) {
  $tool=[string]$data.tool
  $originals=@($data.items)
  if($originals.Count -lt 1 -or $originals.Count -gt 5000){throw 'Seleccion vacia o demasiado grande.'}
  $results=@();[long]$bytes=0
  if($tool -in @('temp','shader')){
    $roots=@(Get-CleanupRoots $tool)
    foreach($entry in $originals){
      $root=$roots|Where-Object path -IEQ $entry.root|Select-Object -First 1
      $ok=$false;$reason='Archivo cambiado, en uso, redirigido o no disponible'
      if($root -and (Test-SafeCleanupPath $entry.path $root.path)){
        $file=Get-Item -LiteralPath $entry.path -Force -ErrorAction SilentlyContinue
        if($file -and [long]$file.Length -eq [long]$entry.bytes -and $file.LastWriteTimeUtc.Ticks.ToString() -ceq $entry.modified -and $file.LastWriteTimeUtc -le [DateTime]::UtcNow.AddDays(-[int]$root.days)){
          $ok=[NexoNative]::DeleteReviewedFile($file.FullName,$root.path,[long]$entry.bytes,[long]$entry.modified)
          if($ok){$bytes+=[long]$entry.bytes;$reason='Eliminado'}else{$reason='Windows no permite eliminarlo o el archivo cambio; se omitio'}
        }
      }
      $results+=@{name=$entry.name;ok=$ok;reason=$reason}
    }
  }elseif($tool -eq 'background'){
    $allowed=@(Get-BackgroundApps)
    foreach($entry in $originals){
      $match=$allowed|Where-Object{$_.id -ceq $entry.id -and $_.started -ceq $entry.started}|Select-Object -First 1
      $ok=$false
      if($match){$p=Get-IdentifiedProcess $entry;if($p){$ok=$p.CloseMainWindow()}}
      $results+=@{name=$entry.name;ok=$ok;reason=if($ok){'Cierre normal solicitado. Atiende cualquier dialogo de guardado.'}else{'La app termino, esta en primer plano o no acepta cierre normal.'}}
    }
  }elseif($NexoAppGroups.ContainsKey($tool)){
    $allowed=@(Get-RemovableApps $tool)
    foreach($entry in $originals){
      $match=$allowed|Where-Object id -CEQ $entry.id|Select-Object -First 1
      if(-not $match){$results+=@{name=$entry.name;ok=$false;reason='La app ya no coincide con la revision'};continue}
      try{Remove-AppxPackage -Package $match.id -ErrorAction Stop
        $still=Get-AppxPackage -ErrorAction Stop|Where-Object PackageFullName -CEQ $match.id
        if($still){throw 'El paquete sigue instalado.'}
        $results+=@{name=$match.name;ok=$true;reason='Desinstalado para tu usuario. Reinstalacion manual desde Store.'}
      }catch{$results+=@{name=$match.name;ok=$false;reason=$_.Exception.Message}}
    }
  }elseif($tool -eq 'flush-dns'){
    Clear-DnsClientCache -ErrorAction Stop;$results+=@{name='DNS';ok=$true;reason='Cache vaciada. Servidores sin cambios.'}
  }elseif($tool -eq 'explorer'){
    $explorers=@(Get-Process -Name explorer -ErrorAction SilentlyContinue|Where-Object{$_.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId})
    foreach($p in $explorers){if(Test-Owned $p.Id){Stop-Process -Id $p.Id -ErrorAction Stop}}
    Start-Sleep -Milliseconds 500
    if(-not (Get-Process -Name explorer -ErrorAction SilentlyContinue|Where-Object{$_.SessionId -eq [Diagnostics.Process]::GetCurrentProcess().SessionId})){Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ErrorAction Stop}
    $results+=@{name='Explorer';ok=$true;reason='Reinicio solicitado para esta sesion.'}
  }else{throw 'Herramienta no permitida.'}
  return @{bytes=$bytes;results=$results;restorable=$false}
}
function New-NexoRestorePoint {
  if(-not (Test-NexoAdmin)){return @{created=$false;reason='Requiere administrador; los originales siguen en el historial local.'}}
  try{
    $before=@(Get-ComputerRestorePoint -ErrorAction Stop|Select-Object -ExpandProperty SequenceNumber)
    Checkpoint-Computer -Description ('NEXO '+[DateTime]::Now.ToString('yyyy-MM-dd HH:mm')) -RestorePointType MODIFY_SETTINGS -ErrorAction Stop -WarningAction SilentlyContinue
    $after=@(Get-ComputerRestorePoint -ErrorAction Stop|Where-Object{$before -notcontains $_.SequenceNumber})
    if(-not $after.Count){return @{created=$false;reason='Windows no creo un punto nuevo (proteccion deshabilitada o limite de frecuencia). No se cambia esa configuracion.'}}
    return @{created=$true;reason='Punto de restauracion creado por Windows.';sequence=$after[-1].SequenceNumber}
  }catch{return @{created=$false;reason=$_.Exception.Message}}
}
function Get-NexoDiagnostics {
  $computer=Get-CimInstance Win32_ComputerSystem -ErrorAction Stop
  $cpu=Get-CimInstance Win32_Processor -ErrorAction Stop|Select-Object -First 1
  $os=Get-CimInstance Win32_OperatingSystem -ErrorAction Stop
  $board=Get-CimInstance Win32_BaseBoard -ErrorAction SilentlyContinue|Select-Object -First 1
  $bios=Get-CimInstance Win32_BIOS -ErrorAction SilentlyContinue|Select-Object -First 1
  $ram=@(Get-CimInstance Win32_PhysicalMemory -ErrorAction SilentlyContinue|ForEach-Object{@{capacityGB=[math]::Round($_.Capacity/1GB,1);speed=$_.ConfiguredClockSpeed;type=switch($_.SMBIOSMemoryType){24{'DDR3'}26{'DDR4'}34{'DDR5'}default{'No identificado'}};manufacturer=[string]$_.Manufacturer;slot=[string]$_.DeviceLocator}})
  $gpu=@(Get-CimInstance Win32_VideoController -ErrorAction SilentlyContinue|ForEach-Object{@{name=$_.Name;driver=$_.DriverVersion;driverDate=if($_.DriverDate){$_.DriverDate.ToUniversalTime().ToString('o')}else{$null};resolution=if($_.CurrentHorizontalResolution){[string]$_.CurrentHorizontalResolution+' x '+[string]$_.CurrentVerticalResolution}else{$null};refreshHz=$_.CurrentRefreshRate}})
  $physical=@();try{$physical=@(Get-PhysicalDisk -ErrorAction Stop|ForEach-Object{@{name=[string]$_.FriendlyName;type=[string]$_.MediaType;bus=[string]$_.BusType;sizeGB=[math]::Round($_.Size/1GB);health=[string]$_.HealthStatus}})}catch{}
  $volumes=@(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3' -ErrorAction SilentlyContinue|ForEach-Object{@{name=$_.DeviceID;totalGB=[math]::Round($_.Size/1GB,1);freeGB=[math]::Round($_.FreeSpace/1GB,1);system=($_.DeviceID -eq $env:SystemDrive)}})
  $startup=@(Get-CimInstance Win32_StartupCommand -ErrorAction SilentlyContinue|ForEach-Object{@{name=$_.Name;location=$_.Location;user=$_.User}})
  $integrity=$null;try{$dg=Get-CimInstance -Namespace root\Microsoft\Windows\DeviceGuard -ClassName Win32_DeviceGuard -ErrorAction Stop;$integrity=@($dg.SecurityServicesRunning) -contains 2}catch{}
  return @{admin=(Test-NexoAdmin);platform=(Get-PlatformInfo);device=(Get-CachedDevice);cpu=@{name=$cpu.Name;cores=$cpu.NumberOfCores;threads=$cpu.NumberOfLogicalProcessors;maxMHz=$cpu.MaxClockSpeed;l3KB=$cpu.L3CacheSize};memoryModules=$ram;totalMemoryGB=[math]::Round($computer.TotalPhysicalMemory/1GB,1);gpu=$gpu;physicalDisks=$physical;volumes=$volumes;board=if($board){[string]$board.Manufacturer+' '+[string]$board.Product}else{$null};bios=$bios.SMBIOSBIOSVersion;uptimeHours=[math]::Round(([DateTime]::Now-$os.LastBootUpTime).TotalHours,1);processCount=@(Get-Process).Count;startup=$startup;memoryIntegrity=$integrity;activePlan=(Get-ActivePlan);capturedAt=[DateTime]::UtcNow.ToString('o')}
}
function Get-NvidiaSample {
  $executable=@((Join-Path $env:SystemRoot 'System32\nvidia-smi.exe'),(Join-Path $env:ProgramFiles 'NVIDIA Corporation\NVSMI\nvidia-smi.exe'))|Where-Object{Test-Path -LiteralPath $_ -PathType Leaf}|Select-Object -First 1
  if(-not $executable){return $null}
  $process=New-Object Diagnostics.Process
  $process.StartInfo=New-Object Diagnostics.ProcessStartInfo
  $process.StartInfo.FileName=$executable
  $process.StartInfo.Arguments='--query-gpu=utilization.gpu,temperature.gpu,memory.used,memory.total --format=csv,noheader,nounits --id=0'
  $process.StartInfo.UseShellExecute=$false;$process.StartInfo.CreateNoWindow=$true;$process.StartInfo.RedirectStandardOutput=$true;$process.StartInfo.RedirectStandardError=$true
  try{
    [void]$process.Start()
    if(-not $process.WaitForExit(800)){try{$process.Kill()}catch{};return $null}
    if($process.ExitCode -ne 0){return $null}
    $parts=@($process.StandardOutput.ReadToEnd().Trim().Split(',')|ForEach-Object{$_.Trim()})
    if($parts.Count -ne 4){return $null}
    $values=@();foreach($part in $parts){[double]$number=0;if([double]::TryParse($part,[Globalization.NumberStyles]::Float,[Globalization.CultureInfo]::InvariantCulture,[ref]$number)){$values+=$number}else{$values+=$null}}
    return @{utilization=$values[0];temperatureC=$values[1];memoryUsedMB=$values[2];memoryTotalMB=$values[3];capturedAt=[DateTime]::UtcNow.ToString('o');source='nvidia-smi · GPU 0'}
  }catch{return $null}finally{$process.Dispose()}
}
function Open-NvidiaPanel {
  $classic=Join-Path $env:ProgramFiles 'NVIDIA Corporation\Control Panel Client\nvcplui.exe'
  if(Test-Path -LiteralPath $classic -PathType Leaf){Start-Process -FilePath $classic -ErrorAction Stop;return $true}
  $package=Get-AppxPackage -Name NVIDIACorp.NVIDIAControlPanel -ErrorAction SilentlyContinue|Select-Object -First 1
  if($package -and $package.PackageFamilyName -match '^NVIDIACorp\.NVIDIAControlPanel_[a-z0-9]+$'){
    Start-Process -FilePath (Join-Path $env:SystemRoot 'explorer.exe') -ArgumentList ('shell:AppsFolder\'+$package.PackageFamilyName+'!NVIDIACorp.NVIDIAControlPanel') -ErrorAction Stop
    return $true
  }
  throw 'No se encontro el Panel de control NVIDIA. Instalalo mediante el controlador o Microsoft Store.'
}
