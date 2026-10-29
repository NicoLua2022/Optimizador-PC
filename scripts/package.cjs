(async () => {
  const { packager } = await import('@electron/packager');
  const result = await packager({ dir:'.', out:'dist', name:'NEXO', executableName:'NEXO', platform:'win32', arch:'x64', asar:true, overwrite:true, prune:true, ignore:[/^\/(test|scripts|\.github|test-results|playwright-report|dist)(\/|$)/, /^\/playwright\.config\.cjs$/, /^\/\.git(\/|$)/], win32metadata:{CompanyName:'NicoLua2022',FileDescription:'NEXO PC Performance',ProductName:'NEXO',InternalName:'NEXO'}, windowsSign:undefined });
  console.log('Aplicación portable creada:',result.join(', '));
  console.log('En Windows, abre NEXO.exe dentro de la carpeta completa. No requiere instalación.');
})().catch(e=>{console.error(e);process.exitCode=1;});
