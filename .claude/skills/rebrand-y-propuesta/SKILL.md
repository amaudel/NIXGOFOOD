---
name: rebrand-y-propuesta
description: Rebrandea el negocio piloto/demo de NIXGOFOOD a un concepto de restaurante nuevo (código + base de datos real) y/o genera un deck de venta persuasivo con capturas reales de la app para ese negocio. Usar cuando el usuario pida "cambiar el restaurante", "cambiar la demo", "armar una propuesta/presentación para vender la app", o ambas cosas.
---

# Rebrand del negocio piloto + propuesta de venta

Este skill documenta, paso a paso, cómo se hizo el rebrand de "El Taca
Nijo" a "404" y cómo se armó su deck de venta en esta misma sesión.
Sirve para repetir el proceso con un concepto de restaurante distinto,
o para volver a generar solo el deck sin tocar el negocio.

Antes de arrancar, pedí al usuario (si no lo dio ya) lo mínimo:
nombre del negocio, slogan/concepto de una línea, ciudad, 1-2
sucursales con dirección aproximada, colores de marca (o "los mismos
de 404" si no importa), y unas 10-16 categorías/productos con precio.
Si falta algo, avanzá con supuestos razonables y avisá qué asumiste
en una línea — no bloquees el trabajo por eso.

## Parte 1 — Rebrandear el negocio (código)

El negocio piloto vive con IDs fijos en todo el repo:
`b0000000-0000-0000-0000-000000000001` (negocio) y
`b0000000-0000-0000-0000-000000000002` (sucursal principal). No los
cambies — solo su contenido.

Archivos a actualizar, en este orden:

1. **`src/data/demoSeed.ts`** — la fuente de verdad del modo demo
   (`NEXT_PUBLIC_DEMO_MODE=true`). Reescribir `demoBusiness`,
   `demoBranch(es)`, `demoCategories`, `demoModifierGroups`,
   `demoProducts`, `demoDeliveryZones`, `demoBusinessHours` y
   `demoInitialOrders` con el nuevo concepto. Los `id` de productos y
   categorías son strings libres acá (no UUID), podés nombrarlos
   descriptivamente (`p_burger_x`, `cat_x`).
2. **`src/config/business.ts`** — `businessConfig` y `activeBranch`,
   usados en modo producción. Deben reflejar el mismo negocio que
   `demoSeed.ts` (nombre, slug, colores, dirección de la sucursal
   principal).
3. **`src/app/page.tsx`** — sección "Caso real" de la landing de
   marketing: nombre del negocio, sucursales, descripción de una
   línea, y la constante de URL del menú (`https://<slug>.food.nixgodigital.com`).
   Buscá también otras menciones sueltas del nombre viejo en ese
   archivo (p. ej. "Es el mismo modo en el que ya trabaja X").
4. **Barrido de residuos de marca** — el nombre viejo se cuela en
   lugares no obvios. Correr:
   `grep -rln "<nombre-viejo>" --include="*.tsx" --include="*.ts" src/`
   y revisar cada resultado. Ya encontramos dos así en 404: un emoji
   de taco 🌮 hardcodeado como ícono del botón de chat
   (`src/components/ChatWidget.tsx`) y el texto de la landing. Prestá
   atención especial a: `ChatWidget.tsx`, `checkout/page.tsx`,
   `SettingsBusinessClientPage.tsx`, `AdminLayout.tsx`.

## Parte 2 — Rebrandear la base de datos real (si hay una conectada)

Si el entorno tiene un conector de Supabase activo (herramientas
`mcp__Supabase__*` disponibles), el negocio piloto probablemente ya
tiene datos reales cargados con IDs que **no necesariamente coinciden**
con los de `supabase/seed.sql` — ese archivo puede no ser lo que
sembró la base real (nos pasó: los productos reales usaban prefijo
`f0...`, no `d0...` como el seed.sql del repo). Por eso:

1. Antes de escribir nada, `SELECT` el estado actual de `businesses`,
   `branches`, `categories`, `products`, `delivery_zones`,
   `business_hours` para el `business_id` del piloto, y contá cuántas
   filas hay en `orders` para ese negocio.
2. **Nunca borres y recrees a ciegas.** Si hay pedidos reales
   (`orders` > 0), reescribí los productos/categorías EXISTENTES en su
   lugar (`UPDATE ... WHERE id = '<id-real>'`) en vez de borrarlos —
   `order_items` guarda un snapshot del nombre del producto aparte
   (`product_name_snapshot`), así que renombrar un producto no rompe
   el historial. Insertá filas nuevas (`INSERT`) solo para lo que falte
   completar el menú nuevo.
3. Si el usuario aclara que los pedidos son de prueba (no reales), lo
   anterior sigue siendo la práctica más segura igual — no hace falta
   preguntar de nuevo, pero sí confirmar una vez antes de escribir en
   una base compartida si algo no cuadra (por ejemplo, más de un
   negocio en la tabla, o datos que no esperabas).
4. Actualizá también `supabase/seed.sql` y
   `supabase/scripts/master_setup.sql` en el repo para que sigan
   siendo una referencia útil, aunque no sean lo que corrió en
   producción.

Commiteá cada paso lógico por separado (rebrand de código, rebrand de
scripts SQL, fixes de residuos de marca sueltos) con mensajes
descriptivos, y pusheá al branch de trabajo indicado en las
instrucciones del proyecto.

## Parte 3 — Generar el deck de venta

Usa el tipo de Artifact **Slides** (`Artifact` tool, `action:
"quickstart"`, `intent: "slides"`). Lee el `SKILL.md` de ese tipo que
te devuelve — trae el formato exacto de diapositiva (HTML con subset
de CSS inline, canvas 1920×1080). Estas notas son el criterio de
diseño y copy, no el formato técnico.

### 3.1 — Levantar la app para sacar capturas reales

Nunca uses mockups genéricos ni pidas al usuario imágenes de IA para
las pantallas del producto — sacá capturas reales:

```bash
npm install   # si no hay node_modules
cat > .env.local <<'EOF'
NEXT_PUBLIC_DEMO_MODE=true
ROOT_DOMAIN=localhost:3000
NEXT_PUBLIC_ROOT_DOMAIN=localhost:3000
SITE_URL=http://localhost:3000
NEXT_PUBLIC_AGENT_CHAT_URL=https://placeholder.workers.dev
EOF
nohup npm run dev > /tmp/nextdev.log 2>&1 & disown
sleep 8   # esperar "Ready" antes de pedir capturas
```

`NEXT_PUBLIC_AGENT_CHAT_URL` con cualquier valor no vacío es necesario
para que el widget de chat se renderice (si está vacío, el componente
hace `return null`). El negocio piloto resuelve por subdominio, no por
ruta — en local:

- Tienda del cliente: `http://<slug>.localhost:3000/` (la home ES el
  menú, no hay `/store`).
- Panel admin: `http://admin.localhost:3000/admin` y sub-rutas
  (`/admin/orders`, `/admin/kitchen`, `/admin/delivery`,
  `/admin/prep-times`, `/admin/menu/products`,
  `/admin/settings/loyalty`).
- Fidelización del cliente: `http://<slug>.localhost:3000/loyalty`.

Para capturas simples, el CLI global alcanza:
`playwright screenshot --viewport-size="430,932" --wait-for-timeout=2000 "http://<slug>.localhost:3000/" archivo.png`
(usar `1440,900` para pantallas de admin). Para interacción (abrir el
chat, hacer scroll, agregar al carrito) hace falta el paquete
`playwright` de Node, que no está en `node_modules` del repo pero sí
global: `NODE_PATH=/opt/node22/lib/node_modules node script.js` con un
script que haga `require('playwright')` y use
`chromium.launch({ executablePath: '/opt/pw-browsers/chromium' })`.

Capturas mínimas recomendadas (ajustar según qué features tenga el
negocio nuevo):

- Home de la tienda (hero, rating, CTA "Pedir ahora").
- Grilla de productos con botón "Agregar".
- Panel resumen del admin.
- Pedidos / Caja (con cliente, dirección, pago).
- Cocina KDS.
- Tiempos de Preparación (si existe la función de ajuste automático
  por carga — es un diferenciador fuerte, no lo omitas si aplica).
- Delivery / zonas.
- Chat del agente de IA abierto (si `NEXT_PUBLIC_AGENT_CHAT_URL` está
  seteado).
- Fidelización, vista del cliente.

Subí todas las capturas de una vez con `Artifact` `action: "publish"`,
`asset: true`, `file_paths: [...]` contra la URL del deck, y guardá
los `/_blob/<id>` que devuelve — son los únicos valores válidos para
`<img src>` en las diapositivas.

Al terminar, bajá el server (`pkill -f "next dev"`) y no commitees
`.env.local` ni las capturas al repo — son material de trabajo, no
código.

### 3.2 — Estructura del deck (11-14 diapositivas)

Seguí este arco narrativo, aplicando principios de persuasión sin
nombrarlos nunca dentro del deck (nada de "esto es neuroventas" en el
copy — se aplica, no se explica):

1. **Portada** — foto real de producto a página completa (de
   `public/demo/products/` o `public/demo/hero/` si el negocio nuevo
   ya tiene imágenes generadas; si no, pedí el prompt al usuario para
   que la genere él). Titular que ataca el dolor de fondo (perder
   control del pedido), sin nombrar la solución todavía.
2. **El problema** — tabla comparativa "con agregador" vs. "con
   NixGoFood": comisión, dueño del cliente, datos, riesgo de reglas
   que cambian. Cerrar con una línea que adelanta la objeción obvia
   ("no se trata de dejar de usar agregadores, sino de no depender de
   ellos").
3. **El costo invisible** — 4 tarjetas de dolor operativo diario
   (pedidos perdidos en WhatsApp, cocina que se entera tarde, nadie
   audita, cero historial). Agitación antes de la solución.
4. **La propuesta** — diapositiva de acento a todo color (única del
   deck), frase ancla de regla-de-tres tipo "Tu plataforma. Tu
   cliente. Tu margen." Es el punto de giro del pitch.
5. en adelante — **una diapositiva de prueba por feature real**,
   siempre con el mismo layout (texto + bullets a un lado, captura
   real enmarcada al otro): menú del cliente, panel de pedidos,
   cocina, cocina-a-full (si aplica), agente de IA (si aplica),
   delivery, fidelización (si aplica). No inventes features que el
   negocio no tiene — mirá el sidebar del admin real para saber qué
   mostrar.
6. **Prueba social** — cifras reales y verificables del propio
   negocio (sucursales, productos, zonas de entrega, $0 comisión).
   Nunca inventes cifras de ventas u opiniones que no existen.
7. **Cómo empezar** — modo demo vs. modo producción, para bajar el
   riesgo percibido de decidir.
8. **Cierre** — una sola cifra grande y memorable ($0.00 de comisión),
   con una única acción de bajo compromiso (pedir una demo, no
   "firmá ya").

Paleta: usá los colores reales del negocio (`src/config/business.ts`
`primaryColor`/`secondaryColor`, más los gradientes que uses de
verdad en `src/app/store/**/*.tsx` — buscá `bg-gradient-to-r` /
clases Tailwind de color ahí en vez de inventar hexadecimales). Dos
tonos oscuros + un acento, nunca `#fff`/`#000` puros. Tipografía: la
misma que usa la app en `src/app/fonts.ts` si es Google Font, para que
el deck se sienta una extensión del producto.

Escribí notas de orador (`<aside>`) en cada diapositiva explicando el
porqué de la decisión de copy/diseño — le sirven al usuario para
presentar y para entender qué técnica se aplicó sin que aparezca en
pantalla.

Al final, dale el link del Artifact al usuario. No lo verifiques ni lo
abras vos mismo salvo que el usuario lo pida explícitamente (regla del
tipo Slides).
