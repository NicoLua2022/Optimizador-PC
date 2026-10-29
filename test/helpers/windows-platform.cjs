// Test-only compatibility fixtures. Never loaded by the application or packaged into the release.
const {nativeScript}=require('../../app/core/telemetry.cjs');
function platformFixture(family){
 const build=family===10?19045:22631;
 const marker='try {\n  $data = [Text.Encoding]';
 const source=nativeScript();if(!source.includes(marker))throw new Error('Native dispatch marker missing.');
 const fixture=`function Get-PlatformInfo { return @{caption='Microsoft Windows ${family} Pro';family='Windows ${family}';build=${build};productType=1;displayVersion='test fixture';architecture='64-bit';supported=$true;reason=$null} }\n`;
 return source.replace(marker,fixture+marker);
}
module.exports={platformFixture};
