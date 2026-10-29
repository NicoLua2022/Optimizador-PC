// Recommendations are applied by the player in the official game's own settings.
// We intentionally do not edit game files or driver profiles.
export function recommendations(name) {
  const n=name.toLowerCase();
  if(n.includes('counter-strike'))return [
    ['NVIDIA Reflex','Si aparece en el menú, prueba Activado y compara latencia. No presupone más FPS.'],
    ['Sombras y oclusión ambiental','Baja primero oclusión y efectos. Conserva las sombras necesarias para ver a los rivales.'],
    ['Prueba reproducible','Usa el mismo mapa y recorrido con idéntica resolución; evita comparar servidores diferentes.']
  ];
  if(n.includes('valorant'))return [
    ['Renderizado multihilo','En tu Ryzen de 8 núcleos, prueba el renderizado multihilo desde los ajustes del juego.'],
    ['NVIDIA Reflex','Si está disponible, actívalo para evaluar latencia; no se instala ningún módulo externo.'],
    ['Calidad y límite de FPS','Prueba detalles y efectos bajos; usa un límite de FPS que tu equipo sostenga de forma estable.']
  ];
  if(n.includes('fortnite'))return [
    ['Modo de renderizado','Compara DX12 con Modo Rendimiento desde Fortnite. Cambiar de modo puede requerir reiniciar el juego.'],
    ['DX12 y RTX','Si usas DX12 y el juego lo permite, compara DLSS Calidad con resolución nativa. Desactiva trazado de rayos para priorizar FPS.'],
    ['Primero, calienta la escena','Espera a que termine la compilación de shaders antes de capturar; las primeras partidas pueden tener tirones.']
  ];
  if(n.includes('apex'))return [
    ['NVIDIA Reflex','Evalúa la opción del propio juego cuando esté disponible; evita herramientas de inyección externas.'],
    ['Presupuesto de texturas','Elige un presupuesto que deje margen de VRAM; detectamos el modelo de GPU, no inventamos su memoria dedicada.'],
    ['Efectos y sombras','Reduce sombras dinámicas y efectos antes de sacrificar resolución. Compara en el mismo recorrido del campo de tiro.']
  ];
  return [
    ['Reescalado del juego','Si admite DLSS, FSR o XeSS, compara el modo Calidad con resolución nativa. Puede mejorar FPS cuando limita la GPU.'],
    ['Primero lo más costoso','Compara trazado de rayos, sombras y efectos. Cambia una sola opción por prueba para saber qué ayuda.'],
    ['Controla la estabilidad','Mantén un límite de FPS sostenible y repite la misma escena para comparar FPS medios y 1 % low.']
  ];
}
