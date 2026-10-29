function classifyWindows(info={}) {
  const build=Number(info.build), productType=Number(info.productType);
  const family=/\bWindows\s+(10|11)\b/i.exec(info.caption||'')?.[1];
  const supported=productType===1&&((family==='10'&&build>=10240&&build<22000)||(family==='11'&&build>=22000));
  return {...info,build,productType,family:family?`Windows ${family}`:'Windows no compatible',supported,
    reason:supported?null:'Solo se admiten ediciones de escritorio de Windows 10 y Windows 11. Windows Server y otras versiones quedan en modo de consulta.'};
}
module.exports={classifyWindows};
