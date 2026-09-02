# TradeLab Bot — proyecto único (npm install aquí)

Esta carpeta (`bot-app/`) es AHORA un solo proyecto npm que incluye:

- La app real del bot builder (React + TypeScript) en `src/`.
- `public/home.html` → tu antiguo "Home" (índice de Deriv.zip), ya integrado.
- `public/options.html` → tu antiguo "Options", ya integrado.
- `public/assets/sim/` → el JS (`sim-shared.js`) y las imágenes que usan
  `home.html`/`options.html` (guardado del saldo virtual, íconos, etc).

`public/` es la carpeta estándar de rsbuild para archivos estáticos: todo lo
que hay ahí se sirve/copia tal cual, junto con la app compilada.

## Cómo ejecutarlo

```bash
npm install
npm run dev
```

Esto levanta un servidor local (revisa la terminal para ver el puerto, algo
como `http://localhost:5173`). Ahí vas a poder ver:

- `http://localhost:<puerto>/home.html` → Home
- `http://localhost:<puerto>/options.html` → Options
- `http://localhost:<puerto>/` → la app real de Bot Builder (React)

Desde "Options", la tarjeta y el pill de **"Bot Builder"** ya llevan a `/`
(la raíz), o sea a la app real — todo dentro del mismo `npm install`, sin
tocar nada más.

Para generar la build final de producción en vez de correr el servidor de
desarrollo:

```bash
npm run build
```

Esto genera `dist/` con todo (incluyendo `dist/home.html` y
`dist/options.html`) listo para subir a cualquier hosting estático.

## Corregí también el bug de navegación ("se cierra / pide verificación")

La causa era HTML inválido en el nav inferior de una de las páginas
(`chart.html` del mockup original, que ya no forma parte de este proyecto
unificado): tenías etiquetas `<a>` metidas dentro de `<button>`
(`<button><a href="...">Home</a></button>`), algo que no es válido y que
varios navegadores manejan de forma errática (doble disparo del evento de
navegación, lo que en algunos casos activa un diálogo nativo de "¿confirmar
salida de la página?"). Lo corregí dejando cada botón de navegación como un
único `<a>` normal, sin anidar. En `home.html`/`options.html` (que son las
páginas que ahora sí se ejecutan aquí) no había ese problema — usan
`onclick="window.location.href='...'"` sobre un solo elemento, que es seguro.

## No toqué (y por qué)

- Los endpoints reales (`wss://ws.derivws.com`, OAuth) y el
  `NEXT_PUBLIC_DERIV_APP_ID`: son necesarios para que la app conecte con tu
  propia cuenta real de Deriv y corra tus bots — esa es la función legítima
  de este proyecto, distinta al saldo simulado de `home.html`/`options.html`.
- El identificador de código `DBot` (una clase interna del motor del bot):
  renombrarlo sin poder compilar y probar aquí sería arriesgado.
