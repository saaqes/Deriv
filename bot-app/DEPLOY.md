# Desplegar en Render

Este proyecto es 100% estático en tiempo de ejecución (una SPA de React que
compila a HTML/JS/CSS, más `home.html`/`options.html`). En Render eso se
despliega como **Static Site** — no hace falta un "Web Service" con backend.

## Opción A — con Blueprint (`render.yaml`), la más rápida

1. Sube esta carpeta (`bot-app/`) a un repositorio de GitHub/GitLab. El
   `render.yaml` que dejé adentro debe quedar en la **raíz del repo**.
2. En Render: **New → Blueprint**, conecta el repo.
3. Render va a leer `render.yaml` y pedirte valores para las variables
   marcadas como privadas (`NEXT_PUBLIC_DERIV_APP_ID`,
   `NEXT_PUBLIC_DERIV_REFERRAL_LINK`). Puedes dejarlas vacías por ahora — si
   no las llenas, el build usa los valores que ya vienen en
   `.env.production` como respaldo.
4. Deploy. Render corre `npm install && npm run build` y publica `dist/`.

## Opción B — manual, sin `render.yaml`

1. **New → Static Site**, conecta tu repo (o sube el código a GitHub).
2. **Root Directory**: `bot-app` (si subiste toda la carpeta `tradelab/`
   con `bot-app/` y `site-standalone/` juntas al mismo repo).
3. **Build Command**: `npm install && npm run build`
4. **Publish Directory**: `dist`
5. Agrega las variables de entorno (pestaña *Environment*) si quieres
   sobreescribir las de `.env.production`.
6. En **Redirects/Rewrites**, agrega una regla:
   - Source: `/*`
   - Destination: `/index.html`
   - Action: `Rewrite`

   (Esto es solo para que las rutas internas de la app de React no den 404
   al recargar la página. `home.html`, `options.html` y los `assets/`
   se siguen sirviendo normal porque Render prioriza archivos reales sobre
   cualquier regla — confirmado en su documentación.)

## Importante: tu propio `app_id` de Deriv para que el login funcione

El proyecto trae, de fábrica, un `NEXT_PUBLIC_DERIV_APP_ID` y un
`NEXT_PUBLIC_DERIV_REFERRAL_LINK` de ejemplo (heredados de la plantilla
original). **Antes de usarlo en serio en producción:**

1. Ve a https://developers.deriv.com, crea tu propia app y copia tu propio
   `app_id`.
2. En el registro de la app, agrega como **redirect URI** la URL que
   Render te asigne, por ejemplo `https://tradelab-bot.onrender.com`
   (o tu dominio propio si conectas uno). Si no coincide exactamente, el
   login por OAuth va a fallar en producción aunque funcione en local.
3. Reemplaza `NEXT_PUBLIC_DERIV_APP_ID` (y quita o cambia
   `NEXT_PUBLIC_DERIV_REFERRAL_LINK`, que es un link de afiliado que no es
   tuyo) en `.env.production` o como variable de entorno en Render.

## Cómo queda organizado una vez desplegado

- `https://tu-sitio.onrender.com/home.html` → Home
- `https://tu-sitio.onrender.com/options.html` → Options
- `https://tu-sitio.onrender.com/` → la app real de Bot Builder

Si quieres que la app abra directo en Home en vez de en el bot builder,
dímelo y agrego una redirección de `/` a `/home.html` (implica que la app
de React deje de ser la página raíz).
