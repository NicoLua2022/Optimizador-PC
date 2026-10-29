# Pure tests with explicit in-process fakes. No Windows setting or external command is changed.
$ErrorActionPreference='Stop'
. (Join-Path (Join-Path (Split-Path $PSScriptRoot) 'app/native') 'system.ps1')
function Assert-Nexo($condition,[string]$message){if(-not $condition){throw $message}}
Assert-Nexo (Test-ResourceEqual @{a=1;b=@{x=2;y=3}} @{b=@{y=3;x=2};a=1}) 'Canonical equality must ignore dictionary ordering.'
Assert-Nexo (-not (Test-ResourceEqual @(1,2) @(2,1))) 'Array order must remain significant.'
$script:BcdText='';$script:Protection=0;$script:CommandCount=0
function Get-BitLockerVolume {param($MountPoint,$ErrorAction) return @{ProtectionStatus=$script:Protection}}
function Invoke-NexoCommand {param($program,$arguments) $script:CommandCount++;return $script:BcdText}
$env:SystemDrive='C:'
$script:BcdText="useplatformclock    Yes"
Assert-Nexo ((Read-BootState 'useplatformclock').value -eq 'yes') 'BCD true must be captured.'
$script:BcdText="useplatformclock    No"
Assert-Nexo ((Read-BootState 'useplatformclock').value -eq 'no') 'BCD false must not be restored as true.'
$script:BcdText="otherSetting    Yes"
Assert-Nexo (-not (Read-BootState 'useplatformclock').exists) 'Absent BCD value must remain absent.'
$script:BcdText="useplatformclock    unknown";$denied=$false
try{Read-BootState 'useplatformclock'|Out-Null}catch{$denied=$true}
Assert-Nexo $denied 'Ambiguous BCD output must not be guessed.'
$script:Protection=1;$script:CommandCount=0;$denied=$false
try{Read-BootState 'useplatformclock'|Out-Null}catch{$denied=$true}
Assert-Nexo ($denied -and $script:CommandCount -eq 0) 'Protected BitLocker volume must block BCD before any command.'
function Test-NexoAdmin {return $true}
function Get-ActivePlan {return '381b4222-f694-41f0-9685-ff5bb260df2e'}
$script:Ac=100;$script:Dc=80;$script:Calls=@()
function Read-PowerSetting {param($target) return @{ac=$script:Ac;dc=$script:Dc}}
function Invoke-NexoCommand {param($program,$arguments) $script:Calls+=,([string[]]$arguments);if($arguments[0] -eq '/setacvalueindex'){$script:Ac=[int]$arguments[4]};return ''}
$spec=@{type='powerSetting';subgroup='54533251-82be-4824-96c1-47b60b740d00';setting='893dee8e-2bef-41e0-89c6-b55d0929964c'}
$entry=@{type='powerSetting';key='power:fixture';target=@{scheme='a1841308-3541-4fab-bc81-f71556f20b4a';subgroup=$spec.subgroup;setting=$spec.setting};state=@{ac=5;dc=10}}
Write-SystemTweak @{resources=@($spec)} @{restoring=$true;value=@($entry)} | Out-Null
Assert-Nexo ($script:Ac -eq 5 -and $script:Dc -eq 80) 'Restoration must restore only AC, keeping external battery changes.'
Assert-Nexo (@($script:Calls|Where-Object{$_[0] -eq '/setactive' -or $_[0] -eq '/setdcvalueindex'}).Count -eq 0) 'Restoring inactive plan parameters must not activate the plan or write DC.'
$entry.target.setting='48e6b7a6-50f5-4782-a5d4-53bb8f07e226';$script:Calls=@();$denied=$false
try{Write-SystemTweak @{resources=@($spec)} @{restoring=$true;value=@($entry)}|Out-Null}catch{$denied=$true}
Assert-Nexo ($denied -and $script:Calls.Count -eq 0) 'A substituted setting must be rejected before a command.'
'Native policy fixtures passed: canonical state, BCD exactness, encryption gate, AC-only restore, stable targets.'
