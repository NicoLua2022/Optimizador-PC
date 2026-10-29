param(
  [Parameter(Mandatory=$true)][ValidateSet('snapshot','games','powerPlans','powerSet','priorityGet','prioritySet','animationsGet','animationsSet','memoryCandidates','memoryTrim','tweakInspect','tweakWrite','metricsStream','platform','gamePreferences','gamePreferenceWrite')][string]$Action,
  [string]$Payload = 'e30='
)
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false)
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class NexoNative {
  [StructLayout(LayoutKind.Sequential)] public struct MEMORYSTATUSEX {
    public uint length, load; public ulong total, available, pageTotal, pageAvailable, virtualTotal, virtualAvailable, extended;
  }
  [StructLayout(LayoutKind.Sequential)] public struct SYSTEM_POWER_STATUS {
    public byte ACLineStatus, BatteryFlag, BatteryLifePercent, SystemStatusFlag; public uint BatteryLifeTime, BatteryFullLifeTime;
  }
  [DllImport("kernel32.dll", SetLastError=true)] public static extern bool GlobalMemoryStatusEx(ref MEMORYSTATUSEX value);
  [DllImport("kernel32.dll")] public static extern bool GetSystemTimes(out long idle, out long kernel, out long user);
  private static long previousIdle, previousTotal;
  public static double CpuSample() {
    long idle, kernel, user;
    if (!GetSystemTimes(out idle, out kernel, out user)) return -1;
    long total = kernel + user, elapsed = total - previousTotal, idleDelta = idle - previousIdle;
    bool first = previousTotal == 0; previousTotal = total; previousIdle = idle;
    return first || elapsed <= 0 ? -1 : Math.Max(0, Math.Min(100, 100.0 * (elapsed-idleDelta) / elapsed));
  }
  [DllImport("kernel32.dll")] public static extern bool GetSystemPowerStatus(out SYSTEM_POWER_STATUS value);
  [DllImport("user32.dll", SetLastError=true)] public static extern bool SystemParametersInfo(uint action, uint param, ref int value, uint flags);
  [DllImport("user32.dll", EntryPoint="SystemParametersInfoW", SetLastError=true)] public static extern bool SetParameter(uint action, uint param, IntPtr value, uint flags);
  [DllImport("kernel32.dll", SetLastError=true)] public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);
  [DllImport("psapi.dll", SetLastError=true)] public static extern bool EmptyWorkingSet(IntPtr handle);
  [DllImport("kernel32.dll")] public static extern bool CloseHandle(IntPtr handle);
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr window, out uint pid);
}
'@
function Get-Memory {
  $m = New-Object NexoNative+MEMORYSTATUSEX
  $m.length = [Runtime.InteropServices.Marshal]::SizeOf($m)
  if (-not [NexoNative]::GlobalMemoryStatusEx([ref]$m)) { throw 'No se pudo consultar la RAM.' }
  return @{ totalGB = [math]::Round($m.total / 1GB, 1); availableGB = [math]::Round($m.available / 1GB, 3); availableBytes=$m.available; totalBytes=$m.total; usedPercent = $m.load }
}
function Get-ActivePlan {
  $text = & "$env:SystemRoot\System32\powercfg.exe" /getactivescheme
  if ($LASTEXITCODE -ne 0) { throw 'No se pudo consultar el plan de energia.' }
  if (($text -join '') -match '[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}') { return $Matches[0].ToLowerInvariant() }
  throw 'Windows no devolvio un plan de energia valido.'
}
function Test-Owned($processId) {
  $cim = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$processId)"
  if (-not $cim) { return $false }
  if ($cim.SessionId -ne [Diagnostics.Process]::GetCurrentProcess().SessionId) { return $false }
  $owner = Invoke-CimMethod -InputObject $cim -MethodName GetOwnerSid
  return $owner.Sid -eq [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
}
function Get-IdentifiedProcess($data) {
  $p = Get-Process -Id ([int]$data.pid) -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  if ($p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) -ne $data.started) { return $null }
  if (-not (Test-Owned $p.Id)) { throw 'No se permite cambiar procesos de otra sesion o usuario.' }
  if ($p.ProcessName -match '(?i)anticheat|easyanti|battleye|vgc|vgk|^(system|csrss|lsass|wininit|services|smss|winlogon)$') { throw 'Proceso protegido; no se modificara.' }
  return $p
}
function Get-Games {
  $found = @{}
  $roots = New-Object 'System.Collections.Generic.List[string]'
  foreach ($key in @('HKCU:\Software\Valve\Steam', 'HKLM:\SOFTWARE\WOW6432Node\Valve\Steam')) {
    $s = Get-ItemProperty $key -ErrorAction SilentlyContinue
    if ($s) { foreach ($prop in @('SteamPath','InstallPath')) { $v = $s.$prop; if ($v -and (Test-Path -LiteralPath $v)) { $roots.Add($v) } } }
  }
  foreach ($root in @($roots.ToArray())) {
    $vdf = Join-Path $root 'steamapps\libraryfolders.vdf'
    if (Test-Path -LiteralPath $vdf) {
      foreach ($match in [regex]::Matches([IO.File]::ReadAllText($vdf), '"path"\s+"([^"]+)"')) { $roots.Add($match.Groups[1].Value.Replace('\\','\')) }
    }
  }
  foreach ($root in @($roots | Select-Object -Unique)) {
    foreach ($manifest in @(Get-ChildItem -LiteralPath (Join-Path $root 'steamapps') -Filter 'appmanifest_*.acf' -ErrorAction SilentlyContinue)) {
      $text = [IO.File]::ReadAllText($manifest.FullName)
      $appId = [regex]::Match($text, '"appid"\s+"(\d+)"').Groups[1].Value
      $name = [regex]::Match($text, '"name"\s+"([^"]+)"').Groups[1].Value
      $dir = [regex]::Match($text, '"installdir"\s+"([^"]+)"').Groups[1].Value
      if ($appId -and $name -and $dir) {
        $directory = [IO.Path]::GetFullPath((Join-Path $root "steamapps\common\$dir"))
        $common = [IO.Path]::GetFullPath((Join-Path $root 'steamapps\common')) + '\'
        if ($directory.StartsWith($common, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $directory)) {
          $found["steam:$appId"] = @{ id="steam:$appId"; appId=$appId; name=$name; source='Steam'; directory=$directory; exe=$null }
        }
      }
    }
  }
  $epic = Join-Path $env:ProgramData 'Epic\EpicGamesLauncher\Data\Manifests'
  foreach ($file in @(Get-ChildItem -LiteralPath $epic -Filter '*.item' -ErrorAction SilentlyContinue)) {
    try {
      $m = [IO.File]::ReadAllText($file.FullName) | ConvertFrom-Json
      if ($m.bIsIncompleteInstall -or -not $m.InstallLocation -or -not $m.LaunchExecutable) { continue }
      $directory = [IO.Path]::GetFullPath($m.InstallLocation)
      $exe = [IO.Path]::GetFullPath((Join-Path $directory $m.LaunchExecutable))
      if ($exe.StartsWith($directory.TrimEnd('\') + '\', [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $exe)) {
        $id = 'epic:' + $m.AppName
        # Epic launchers may require authentication arguments. Discover only; launch through the official launcher.
        $found[$id] = @{ id=$id; name=$m.DisplayName; source='Epic Games'; directory=$directory; exe=$null }
      }
    } catch { continue }
  }
  foreach ($base in @('HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall', 'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall')) {
    foreach ($key in @(Get-ChildItem $base -ErrorAction SilentlyContinue)) {
      $item = Get-ItemProperty $key.PSPath -ErrorAction SilentlyContinue
      if ($item.DisplayName -match '^(VALORANT|League of Legends)$' -and $item.InstallLocation -and (Test-Path -LiteralPath $item.InstallLocation)) {
        $id = 'riot:' + $item.DisplayName
        $found[$id] = @{ id=$id; name=$item.DisplayName; source='Riot'; directory=[IO.Path]::GetFullPath($item.InstallLocation); exe=$null }
      }
    }
  }
  return @($found.Values | Sort-Object name)
}
function Get-Candidates {
  [uint32]$foregroundId = 0
  [void][NexoNative]::GetWindowThreadProcessId([NexoNative]::GetForegroundWindow(), [ref]$foregroundId)
  $allowed = @('chrome','msedge','firefox','Discord','Spotify','ms-teams')
  foreach ($p in @(Get-Process -ErrorAction SilentlyContinue | Where-Object { $allowed -contains $_.ProcessName -and $_.Id -ne $foregroundId -and $_.WorkingSet64 -gt 50MB })) {
    try { if (Test-Owned $p.Id) { @{ pid=$p.Id; name=$p.ProcessName; memoryMB=[math]::Round($p.WorkingSet64/1MB); started=$p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture) } } } catch { continue }
  }
}
# NEXO_PLATFORM_FUNCTIONS
# NEXO_TWEAK_FUNCTIONS
try {
  $data = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($Payload)) | ConvertFrom-Json
  if($Action -in @('powerSet','prioritySet','animationsSet','memoryTrim','tweakWrite','gamePreferenceWrite') -and -not $data.restoring){Assert-SupportedWindows}
  $result = switch ($Action) {
    'platform' { Get-PlatformInfo }
    'gamePreferences' { ,@(Get-GamePreferences $data) }
    'gamePreferenceWrite' { Write-GamePreference $data }
    'metricsStream' {
      while ($true) {
        $cpu = [NexoNative]::CpuSample()
        $sample = @{ memory=(Get-Memory); power=(Get-PowerSample); cpuPercent=if ($cpu -lt 0) { $null } else { [math]::Round($cpu,1) }; capturedAt=[DateTime]::UtcNow.ToString('o') }
        [Console]::Out.WriteLine((@{data=$sample} | ConvertTo-Json -Depth 6 -Compress))
        [Console]::Out.Flush()
        Start-Sleep -Milliseconds 1000
      }
    }
    'tweakInspect' {
      $ids = @($data.ids)
      if ($ids.Count -lt 1 -or $ids.Count -gt 40) { throw 'Seleccion de ajustes no valida.' }
      ,@(foreach ($id in $ids) { Get-TweakInspection (Get-Definition ([string]$id)) })
    }
    'tweakWrite' { Write-Tweak $data }
    'snapshot' {
      $cpu = Get-CimInstance Win32_Processor
      $os = Get-CimInstance Win32_OperatingSystem
      $gpu = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name=$_.Name; driver=$_.DriverVersion } })
      $disks = @(Get-CimInstance Win32_LogicalDisk -Filter 'DriveType=3 OR DriveType=2' | ForEach-Object { @{ name=$_.DeviceID; label=$_.VolumeName; totalGB=[math]::Round($_.Size/1GB); freeGB=[math]::Round($_.FreeSpace/1GB) } })
      $cpuUsage = Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter "Name='_Total'" -ErrorAction SilentlyContinue
      $power = New-Object NexoNative+SYSTEM_POWER_STATUS
      $powerOk = [NexoNative]::GetSystemPowerStatus([ref]$power)
      @{ platform=(Get-PlatformInfo); device=(Get-DeviceInfo); cpu=($cpu.Name -join ', '); cores=($cpu | Measure-Object NumberOfCores -Sum).Sum; threads=($cpu | Measure-Object NumberOfLogicalProcessors -Sum).Sum; cpuPercent=if ($cpuUsage) { $cpuUsage.PercentProcessorTime } else { $null }; memory=(Get-Memory); gpu=$gpu; disks=$disks; os=$os.Caption; powerPlan=(Get-ActivePlan); onBattery=($powerOk -and $power.ACLineStatus -eq 0); gpuPercent=$null; capturedAt=[DateTime]::UtcNow.ToString('o') }
    }
    'games' { ,@(Get-Games) }
    'powerPlans' {
      $list = & "$env:SystemRoot\System32\powercfg.exe" /list
      if ($LASTEXITCODE -ne 0) { throw 'No se pudieron consultar los planes.' }
      $power = New-Object NexoNative+SYSTEM_POWER_STATUS
      $ok = [NexoNative]::GetSystemPowerStatus([ref]$power)
      $guid = '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c'
      @{ device=(Get-DeviceInfo); balanced=if(($list -join '') -match '381b4222-f694-41f0-9685-ff5bb260df2e'){'381b4222-f694-41f0-9685-ff5bb260df2e'}else{$null}; saver=if(($list -join '') -match 'a1841308-3541-4fab-bc81-f71556f20b4a'){'a1841308-3541-4fab-bc81-f71556f20b4a'}else{$null}; active=(Get-ActivePlan); performance=if (($list -join '') -match $guid) { $guid } else { $null }; onBattery=(-not $ok -or $power.ACLineStatus -ne 1) }
    }
    'powerSet' {
      if(-not $data.restoring -and [string]$data.value -eq '8c5e7fda-e8bf-4a96-9a85-a6e23a8c635c' -and (Get-PowerSample).acConnected -ne $true){throw 'Conecta el cargador o confirma la alimentacion AC antes de activar Alto rendimiento.'}
      $guid = [guid]::Parse([string]$data.value).ToString()
      $list = & "$env:SystemRoot\System32\powercfg.exe" /list
      if ($LASTEXITCODE -ne 0 -or ($list -join '') -notmatch [regex]::Escape($guid)) { throw 'El plan de energia ya no existe.' }
      & "$env:SystemRoot\System32\powercfg.exe" /setactive $guid | Out-Null
      if ($LASTEXITCODE -ne 0 -or (Get-ActivePlan) -ne $guid) { throw 'Windows rechazo el cambio de plan de energia.' }
      $true
    }
    'priorityGet' {
      $game = $data.game
      if (-not $game.directory -or -not [IO.Path]::IsPathRooted($game.directory)) { throw 'No se conoce la carpeta del juego.' }
      $directory = [IO.Path]::GetFullPath($game.directory).TrimEnd('\') + '\'
      $items = @(foreach ($p in @(Get-Process -ErrorAction SilentlyContinue)) {
        try {
          $matchesGame = $p.Path -and $p.Path.StartsWith($directory, [StringComparison]::OrdinalIgnoreCase)
          if ($game.source -eq 'Manual') { $matchesGame = $p.Path -and $p.Path.Equals([string]$game.exe, [StringComparison]::OrdinalIgnoreCase) }
          if ($matchesGame -and $p.ProcessName -notmatch '(?i)anticheat|easyanti|battleye|crash|launcher|report|setup|unins|vc_redist' -and (Test-Owned $p.Id)) {
            if ($p.PriorityClass.ToString() -in @('High','RealTime')) { continue }
            @{ pid=$p.Id; started=$p.StartTime.ToUniversalTime().Ticks.ToString([Globalization.CultureInfo]::InvariantCulture); priority=$p.PriorityClass.ToString() }
          }
        } catch { continue }
      })
      if ($items.Count -eq 0) { throw 'Abre primero el juego con su launcher oficial. No se encontraron procesos compatibles de tu usuario.' }
      ,$items
    }
    'prioritySet' {
      if ($data.value -notin @('Normal','AboveNormal','BelowNormal','Idle')) { throw 'Prioridad no permitida.' }
      $p = Get-IdentifiedProcess $data
      if (-not $p -and -not $data.restoring) { throw 'El juego termino antes de aplicar la prioridad. No se cambio otro proceso.' }
      if ($p) {
        $p.PriorityClass = [Diagnostics.ProcessPriorityClass]([string]$data.value)
        $p.Refresh()
        if ($p.PriorityClass.ToString() -ne $data.value) { throw 'Windows no aplico la prioridad.' }
      } # Exited process or reused PID: nothing to restore, never touch the new process.
      $true
    }
    'animationsGet' {
      [int]$value = 0
      if (-not [NexoNative]::SystemParametersInfo(0x1042, 0, [ref]$value, 0)) { throw 'No se pudo consultar la configuracion visual.' }
      [bool]$value
    }
    'animationsSet' {
      if ($data.value -isnot [bool]) { throw 'Valor de animaciones no valido.' }
      $v = [IntPtr]::Zero; if ($data.value) { $v = [IntPtr]1 }
      if (-not [NexoNative]::SetParameter(0x1043, 0, $v, 3)) { throw 'Windows rechazo el cambio visual.' }
      [int]$check = 0
      if (-not [NexoNative]::SystemParametersInfo(0x1042, 0, [ref]$check, 0) -or [bool]$check -ne $data.value) { throw 'No se pudo verificar el cambio visual.' }
      $true
    }
    'memoryCandidates' { ,@(Get-Candidates) }
    'memoryTrim' {
      $before = Get-Memory
      $candidates = @(Get-Candidates)
      $results = @(foreach ($id in @($data.pids)) {
        $candidate = $candidates | Where-Object { $_.pid -eq [int]$id } | Select-Object -First 1
        if (-not $candidate) { @{ pid=$id; ok=$false; reason='No elegible o en primer plano' }; continue }
        $p = Get-IdentifiedProcess $candidate
        if (-not $p) { @{ pid=$id; ok=$false; reason='El proceso termino' }; continue }
        $handle = [NexoNative]::OpenProcess(0x0500, $false, [int]$id)
        if ($handle -eq [IntPtr]::Zero) { @{ pid=$id; ok=$false; reason='Acceso denegado' }; continue }
        try { $success = [NexoNative]::EmptyWorkingSet($handle); @{ pid=$id; ok=$success; reason=if ($success) { 'Working set reducido' } else { 'Windows rechazo la solicitud' } } }
        finally { [void][NexoNative]::CloseHandle($handle) }
      })
      @{ before=$before; after=(Get-Memory); processes=$results }
    }
  }
  @{ data=$result } | ConvertTo-Json -Depth 12 -Compress
  exit 0
} catch {
  @{ error=$_.Exception.Message } | ConvertTo-Json -Compress
  exit 1
}
