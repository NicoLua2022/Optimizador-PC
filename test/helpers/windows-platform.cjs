// Test-only compatibility fixtures. Never loaded by the application or packaged into the release.
const {nativeScript}=require('../../app/core/telemetry.cjs');
function platformFixture(family,source=nativeScript()){
 const build=family===10?19045:22631;
 const marker=/try \{\r?\n  \$data = \[Text.Encoding\]/;
 if(!marker.test(source))throw new Error('Native dispatch marker missing.');
 const fixture=`function Get-PlatformInfo { return @{caption='Microsoft Windows ${family} Pro';family='Windows ${family}';build=${build};productType=1;displayVersion='test fixture';architecture='64-bit';supported=$true;reason=$null} }\n`;
 return source.replace(marker,match=>fixture+match);
}
module.exports={platformFixture};
