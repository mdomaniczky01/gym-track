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

## Estructura

```
public/index.html   shell + estilos
public/app.js       toda la lógica
public/manifest.json
public/apple-touch-icon.png   ícono del bíceps (180px)
vercel.json
```

## Cuidado con los datos

Los datos viven solo en ese Safari. Si borrás el historial y datos de sitios, se van.
Ajustes → **Descargar backup (.json)** cada tanto, y **Restaurar desde backup** para volver.

## Formato de los campos

- Tiempos: `45:30` (mm:ss), `1:05:20` (h:mm:ss) o `45` (minutos sueltos).
- Distancia: km en running y bici, metros en natación.
- El ritmo se calcula solo (min/km, min/100m o km/h según la modalidad).
