# NEXO · PC Performance

Aplicación de escritorio en español para Windows 10/11 x64. Creada desde cero para revisar el equipo, preparar sesiones de juego y medir resultados, con una interfaz oscura inspirada en las referencias del proyecto.

![Panel de NEXO en modo demostración](docs/nexo-dashboard.png)

## Abrir en Windows

1. Descomprime **NEXO-Windows-x64.zip** completo.
2. Abre `NEXO.exe` dentro de `NEXO-win32-x64`. Conserva juntos todos los archivos de esa carpeta.
3. El hardware y los juegos compatibles se escanean al iniciar. «Buscar juegos» actualiza la biblioteca; «Añadir juego» permite seleccionar otros `.exe`.
4. Abre el perfil de un juego. Guarda los ajustes o pulsa **Guardar y aplicar**. Si activas prioridad, inicia primero el juego desde su launcher oficial.
5. Al terminar, abre **Historial → Restaurar** para recuperar tu configuración original. Cerrar NEXO **no** restaura el plan de energía.

La distribución es portable y **no tiene firma digital**. Windows puede mostrar una advertencia de reputación. La aplicación no necesita ejecutarse como administrador para el flujo normal; respeta las denegaciones de acceso. No desactives protecciones del sistema ni del juego para usarla. PresentMon/CapFrameX son herramientas externas opcionales, no se incluyen ni se descargan automáticamente.

## Qué hace de verdad

- **Hardware automático:** CPU, núcleos/hilos, modelo y versión de controlador de GPU, RAM física disponible, Windows y capacidad libre de volúmenes accesibles, incluidos discos externos conectados. CPU y RAM se actualizan cada 15 segundos mientras el panel está visible. El uso de GPU aparece como no disponible; no se inventan métricas ni VRAM.
- **Juegos instalados:** manifiestos locales de Steam, bibliotecas de Steam en otras unidades, manifiestos de Epic y entradas de desinstalación de Riot. No explora recursivamente tus discos. Xbox y otros launchers requieren añadir el ejecutable. Algunas instalaciones de Riot no registran `InstallLocation`: añádelas manualmente.
- **Perfiles individuales:** plan Alto rendimiento existente y prioridad opcional `AboveNormal` para procesos del juego de tu usuario. Los ejecutables manuales se identifican por su ruta exacta. Los juegos Steam se inician con su URI oficial; Epic y Riot se abren desde sus launchers, sin inventar argumentos de autenticación.
- **Consejos por juego:** CS2, VALORANT, Fortnite y Apex tienen recomendaciones de sus propios menús. Para otros juegos se muestran pautas generales. Son sugerencias manuales: NEXO no edita configuraciones ni garantiza que una opción exista en todas las versiones.
- **RAM selectiva:** lista procesos elegibles de Chrome, Edge, Firefox, Discord, Teams y Spotify de tu usuario y sesión. Solicita `EmptyWorkingSet` solo para los PIDs que selecciones y vuelve a comprobar elegibilidad. Excluye el proceso en primer plano. No mata procesos ni vacía cachés globales, ni comprime o purga memoria de juegos. Puede afectar a pestañas de un navegador que tenga otros procesos abiertos: úsalo solo con aplicaciones que no estés utilizando.
- **Windows visual separado:** cambio opcional de `SPI_SETCLIENTAREAANIMATION`; jamás se aplica con el perfil del juego. Se consulta y registra el valor anterior.
- **Historial persistente:** guarda el valor original antes de llamar a Windows. Las operaciones ambiguas permanecen recuperables. Si una aplicación falla parcialmente, intenta restaurar los pasos anteriores; conserva cualquier error. Las prioridades incluyen PID y hora de inicio: un PID reutilizado no recibe una restauración de otro proceso.
- **Comparación real de capturas:** importa CSV de frametimes y calcula FPS medios, 1 % low y P99 de tiempos de fotograma. No hay overlay, inyección, lectura de memoria del juego ni captura integrada.

## Qué esperar del rendimiento

No existe un ajuste que aumente FPS en cualquier juego. Si limita la GPU, cambiar el plan de energía o prioridad puede no ayudar; en portátiles puede aumentar temperatura y reducir rendimiento sostenido. El programa no crea el plan Alto rendimiento en equipos Modern Standby que no lo tengan y rechaza activarlo sin corriente AC confirmada.

Para el Ryzen 7 5700, RTX 5070 y 32 GB de RAM, lo útil es identificar el límite real del juego, revisar temperatura/consumo fuera de NEXO y probar opciones del juego como DLSS, trazado de rayos, sombras o límites de FPS. NEXO detecta las especificaciones reales de cada equipo: no supone que tu laptop tenga el mismo hardware.

Windows usa RAM como caché de forma deliberada. Reducir conjuntos residentes no crea RAM nueva ni demuestra una mejora; las aplicaciones recuperan páginas cuando las necesitan y eso puede provocar tirones. No hay liberación automática ni promesas de «RAM optimizada».

No se modifican Defender, Windows Update, servicios, red, BIOS, temporizadores, parámetros de arranque, afinidad, drivers o sistemas anti-cheat. Ninguna aplicación puede garantizar compatibilidad con todas las políticas de todos los juegos; si un proceso rechaza un cambio, NEXO muestra el error y no intenta eludirlo.

## Comparar FPS

1. Captura **un único proceso** con PresentMon, o exporta CSV de frametimes desde CapFrameX. No sirve su JSON ni un CSV de resumen de FPS.
2. Usa resolución, ajustes, recorrido, duración y condiciones iguales; espera a que termine la compilación de shaders.
3. Importa «Antes» y «Después» seleccionando el mismo juego y escribiendo exactamente las mismas condiciones.
4. Repite varias veces. La diferencia entre dos capturas no demuestra por sí sola que el ajuste sea la causa.

Columnas aceptadas, en milisegundos: `MsBetweenPresents`, `FrameTime`, `FrameTime (ms)` o `MsBetweenAppStart`. Mínimo 120 muestras positivas finitas, máximo 20 MB. Se rechazan capturas con varios `ProcessID`. Los valores inválidos/cero se omiten; los tirones largos se conservan. FPS medios = fotogramas / tiempo total. 1 % low = 1000 / media del 1 % de frametimes más lentos, redondeando la cantidad hacia arriba. P99 usa el percentil de rango más cercano. No mezcles modos de captura entre comparaciones: estos valores miden cadencia de presentación/inicio de frames según la columna, no latencia de entrada ni necesariamente frames mostrados en pantalla.

## Desarrollo

Necesitas Node.js **24 o posterior** y npm. En Windows se usa Windows PowerShell 5.1 incluido en el sistema; las políticas corporativas de lenguaje restringido o bloqueo de PowerShell pueden impedir las funciones nativas. No se cambia la política de ejecución.

```sh
npm ci
npm run check
npm test
npm start
```

En Linux o macOS, la interfaz utiliza **modo demostración explícito**, con el hardware de ejemplo del usuario. Los juegos y métricas de ese modo son ilustrativos y los cambios están bloqueados. Para revisar la interfaz en un navegador sin entorno gráfico de escritorio:

```sh
npm run preview
```

El servidor de demostración solo escucha en loopback, no proporciona funciones nativas y no es una versión web del optimizador. Usa el checkout existente de la tarea; no necesitas crear un worktree.

```sh
# Pruebas visuales/funcionales de navegador
npx playwright install chromium
npm run test:ui
# Si el entorno ya tiene Chromium:
# PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run test:ui

# Validación nativa EN WINDOWS: consultas reales y prioridad de un proceso de prueba
npm run test:native

# Generar carpeta portable para Windows (también desde Linux)
npm run package:win
```

En entornos con proxy, Node 24 reciente admite `NODE_USE_ENV_PROXY=1` y `NODE_USE_SYSTEM_CA=1` para las descargas. Conserva proxy, TLS y verificaciones de integridad. El runtime descargado por `@electron/get` valida SHA256; no se omiten verificaciones.

`npm start` comprueba primero que el runtime esté instalado. Si tu entorno omite scripts de dependencias, puedes prepararlo explícitamente con `node node_modules/electron/install.js`.

La carpeta resultante es `dist/NEXO-win32-x64`. El workflow `.github/workflows/windows.yml` ejecuta validaciones y genera un ZIP descargable como artefacto de Actions. Al finalizar correctamente en `main`, publica también una versión de prueba en Releases, etiquetada `preview-<SHA del commit>`. Las pull requests solo validan y empaquetan; no publican versiones.

## Datos, límites y validación

Se guarda un JSON local en `%APPDATA%/nexo-pc/state.json` (Electron `userData`): biblioteca, perfiles, historial y hasta 100 capturas resumidas. No guardamos el contenido CSV completo ni enviamos telemetría. No borres estos datos si tienes ajustes pendientes de restaurar. Si el JSON está corrupto, el inicio se detiene y conserva el archivo; no sustituye silenciosamente el historial.

No incorpora limpieza de archivos, overclock, control de ventiladores, actualización de drivers, medidor de temperatura ni autoajustes gráficos. Una prioridad restaurada tras terminar el proceso ya no requiere escribir en otro proceso. Los cambios manuales posteriores en Windows pueden hacer que el estado actual difiera del historial: «Restaurar» solicita el valor original registrado.

En este entorno Linux se validaron la lógica con pruebas automatizadas, la interfaz con Chromium, la sintaxis de PowerShell y la generación del paquete Windows. **Las operaciones Win32, detección en instalaciones reales y mejoras de FPS no se han validado en un equipo Windows físico.** El ZIP es una primera versión de prueba, no una certificación de rendimiento. Antes de distribuirla públicamente hacen falta esa validación y una firma de código.

Arquitectura: Electron con sandbox, aislamiento de contexto, sin Node en el renderer, CSP local e IPC limitado a operaciones conocidas. El backend valida datos; los comandos PowerShell son del paquete y se pasan como argumentos/base64, sin ejecutar texto del usuario. La interfaz trata nombres de juegos como texto.
