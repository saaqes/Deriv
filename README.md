# TradeLab — estructura del proyecto

```
tradelab/
  bot-app/              ← EL PROYECTO PRINCIPAL. npm install AQUÍ.
    public/home.html      (Home)
    public/options.html    (Options → tarjeta "Bot Builder" a la app real)
    public/assets/sim/      (js + imágenes de home/options)
    src/...                  (app real del bot, ya rebrandeada)
    render.yaml               ← config para desplegar esto en Render
    DEPLOY.md                  ← guía paso a paso de despliegue en Render
    LEEME.md                    ← cómo correrlo localmente + detalle del fix de nav
  site-standalone/      ← Versión vieja, 100% HTML sin build. También trae
                           su propio render.yaml (deploy sin npm/build).
  README.md             ← este archivo
```

## Correr localmente

```bash
cd tradelab/bot-app
npm install
npm run dev
```

Abre `/home.html`, `/options.html` o `/` (la app real) en el navegador.

## Desplegar en Render

Ve a `bot-app/DEPLOY.md` para la guía completa (Blueprint vs. manual,
variables de entorno, y — importante — cómo registrar tu propio `app_id`
de Deriv para que el login funcione en el dominio de Render).

Resumen rápido (Static Site, Root Directory = `bot-app`):
- **Build Command:** `npm install && npm run build`
- **Publish Directory:** `dist`
- **Rewrite:** `/*` → `/index.html` (para las rutas internas de React;
  `home.html`, `options.html` y los `assets/` se siguen sirviendo normal).

Si prefieres la versión sin compilar (`site-standalone/`), su `render.yaml`
no necesita build command ni rewrites — solo sirve los archivos tal cual.

## Recordatorio de lo ya resuelto en turnos anteriores

- Rebranding completo: nada dice "Deriv", todo es "TradeLab Sim" / "TradeLab
  Bot"; sin logos de terceros.
- No existe saldo "Real": todo es "Cuenta Virtual", simulada, con avisos
  permanentes.
- Bug de navegación (HTML inválido `<a>` dentro de `<button>`) corregido en
  ambas versiones.
