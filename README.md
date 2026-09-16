# Entreno

Registro de entrenamiento para iPhone. Pesas, running, bici, natación y actividad libre.
Todo se guarda en el navegador (localStorage): sin cuentas, sin backend, funciona offline.

## Desplegar en Vercel

**Opción A — arrastrar (más rápida)**
1. Entrá a vercel.com/new
2. Arrastrá esta carpeta completa (o el .zip descomprimido).
3. Deploy. Listo.

**Opción B — desde la terminal**
```
npm i -g vercel
cd entreno
vercel --prod
```

**Opción C — sobre tu proyecto viejo**
Reemplazá el contenido del repo por estos archivos y pusheá. Vercel redeploya solo.

## Ponerlo en la pantalla de inicio del iPhone

1. Abrí la URL `*.vercel.app` en **Safari** (no Chrome).
2. Botón compartir → "Agregar a inicio".
3. Aparece el ícono del bíceps 💪🏼 y se abre en pantalla completa, sin barra de Safari.

## Coach

La pestaña Coach lee tus propias sesiones y saca conclusiones sin internet: cuándo subir carga
(3 series a 12+ reps con el mismo peso), cuándo un ejercicio está estancado (3 sesiones sin mejorar
el 1RM estimado), saltos bruscos de volumen en cardio, exceso de series por grupo muscular,
semanas sin descanso y bajadas de peso demasiado rápidas.

Abajo te arma la próxima sesión: elige la rutina que más tiempo lleva sin tocar y calcula el peso y
las reps de cada ejercicio a partir de la última vez que lo hiciste. El botón la abre ya precargada.

Todo el coach corre en el teléfono. No hay API, no hay cuenta y no manda nada a ningún lado.

## Pruebas

```
npm i jsdom xlsx
node tests/e2e.js
```

26 pruebas de extremo a extremo: migración de datos viejos, carga en las cinco modalidades,
series por lado, navegación hacia atrás, coach, métricas y exportación.

## Estructura

```
public/index.html   shell + estilos
public/app.js       toda la lógica
public/catalog.js   1.266 ejercicios con grupo muscular
public/vendor/      SheetJS local, para exportar a Excel sin conexión
public/sw.js        caché offline
tests/e2e.js        pruebas con jsdom
public/manifest.json
public/apple-touch-icon.png   ícono del bíceps (180px)
vercel.json
```

## Funciona sin señal

Después de la primera visita queda todo en caché: la app abre y guarda entrenamientos en el subsuelo
del gym sin datos. La exportación a Excel también funciona offline.

## Series por lado

En cualquier ejercicio de pesas, el botón **Por lado** parte la serie en izquierda y derecha:
pasa de dos casillas a cuatro. El volumen suma los dos lados, el diario lo marca, el detalle
muestra `I 20×10 / D 20×8` y el Excel saca una fila por lado con su columna Lado.
Al activarlo copia lo que ya tenías cargado al lado derecho, así solo corregís lo que difiere.

## Volver atrás

El gesto de deslizar desde el borde y el botón atrás del sistema cierran la capa abierta
(primero la hoja, después el formulario) en vez de salir de la app. Además hay una flecha
arriba a la izquierda en los formularios y una ✕ en las hojas.

## Capas de la interfaz

El orden importa y es fácil de romper sin darse cuenta: barra inferior `z-index:60`,
velo `80`, hoja `90`, avisos `200`. Si la barra sube por encima del velo, tapa el final
de las hojas. Hay una prueba que falla si ese orden se invierte.

## Cuidado con los datos

Los datos viven solo en ese Safari. Si borrás el historial y datos de sitios, se van.
Ajustes → **Descargar backup (.json)** cada tanto, y **Restaurar desde backup** para volver.

## Formato de los campos

- Tiempos: tres casillas separadas (horas / min / seg), todas con teclado numérico.
  Para 45:30 va 45 en min y 30 en seg; las horas se dejan vacías.
- Distancia: km en running y bici, metros en natación.
- El ritmo se calcula solo (min/km, min/100m o km/h según la modalidad).
- En actividad libre podés sumar distancia, FC, pasos, desnivel y demás con "Agregar dato del Garmin".
- El buscador de ejercicios ignora tildes y busca por palabras sueltas: "press incl mancuer" encuentra
  "Press de banca inclinado con mancuernas". Si no existe, lo creás desde el mismo buscador.
