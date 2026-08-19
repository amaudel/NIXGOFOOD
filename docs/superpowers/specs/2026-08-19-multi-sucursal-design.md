# Multi-sucursal con selección de sucursales — Diseño

**Fecha**: 2026-08-19
**Estado**: Aprobado, pendiente de plan de implementación
**Alcance**: Fase 1 (multi-sucursal operativo). La Fase 2 (disponibilidad de productos por sucursal) se especifica aparte.

---

## Problema

NixgoFood opera hoy como si tuviera un solo local. La sucursal es una constante
hardcodeada en `src/config/business.ts:39` (`activeBranch`) que se importa en 12+
lugares y de la que derivan el origen del delivery, las coordenadas del mapa, la
dirección de retiro y el `branchId` que viaja al backend.

La base de datos, en cambio, **ya es multi-sucursal**: `orders`, `delivery_zones` y
`business_hours` llevan `branch_id`, y la función `create_order` ya valida que la
sucursal exista, pertenezca al negocio y esté activa. La limitación es de la capa
de aplicación, no del esquema.

Comparado con Square KDS, Toast o Deliverect —las referencias del proyecto— la
ausencia de multi-sucursal es la brecha estructural más visible: esas plataformas
asumen varias ubicaciones desde el día uno.

## Decisiones tomadas

| Pregunta | Decisión |
|---|---|
| ¿Qué lado necesita selección de sucursal? | Ambos: cliente y admin |
| ¿Cómo llega el cliente a una sucursal? | Automática por cercanía, con opción de cambiarla |
| ¿El menú es igual en todas las sucursales? | Menú y precios compartidos; disponibilidad por sucursal en Fase 2 |
| ¿Quién ve qué sucursal en el admin? | Selector libre para todos los usuarios del panel |
| ¿Cómo se prueba? | Vitest sobre la lógica pura |

## Enfoque elegido

**Contexto de sucursal en runtime.** Se reemplaza la constante `activeBranch` por un
contexto React que carga las sucursales desde el repositorio y expone la
seleccionada. Las URLs no cambian.

Se descartó el enfoque de **sucursal en la ruta** (`/sucursal/<slug>/...`): daría
links por local y SEO por ciudad, pero exige refactorizar el routing, rompe las URLs
de una app que ya está en producción, y encaja mal con la asignación automática por
cercanía —la sucursal solo se conoce cuando el cliente marca su ubicación, no al
entrar. Puede montarse encima de este diseño más adelante si se quiere landing por
local.

---

## 1. Arquitectura y capa de datos

### Tipos

`Branch` (`src/types/index.ts:70`) sirve sin cambios. No se agrega `slug` porque no
hay URLs por sucursal en este enfoque.

### Repositorio

Agregar a `IBusinessRepository`:

```ts
getBranches(businessId?: string): Promise<Branch[]>;
```

En Supabase: filtra `active = true`, ordena por nombre. En demo: lee de
`DEMO_KEYS.BRANCHES`.

`getDeliveryZones(branchId?)` y `getBusinessHours(branchId?)` ya existen en la
interfaz; solo hay que empezar a pasarles la sucursal real. Además,
`getDeliveryZones()` **sin** `branchId` debe devolver todas las zonas del negocio en
una sola consulta —cada `DeliveryZone` ya carga `branchId`— para que el cliente
pueda evaluar la cobertura de todas las sucursales sin hacer N consultas.

### Contexto

Un `BranchProvider` nuevo, **separado de `AppContext`**. `AppContext` ya gestiona
catálogo, carrito, delivery, cliente y pedidos; sumarle sucursales lo volvería más
difícil de mantener y de razonar.

Expone `branches`, `selectedBranch`, `setSelectedBranch` y `loading`. Recibe una
prop `scope: 'customer' | 'admin'` que determina dos cosas:

- La clave de persistencia: `nixgofood_customer_branch` vs `nixgofood_admin_branch`.
- La estrategia de selección inicial: en cliente, por cercanía una vez que hay
  ubicación; en admin, la última usada y, si no hay ninguna guardada, la primera de
  la lista.

`AppContext` pasa a consumir `useBranch()` en lugar de importar la constante.

### Qué desaparece

`activeBranch` deja de ser fuente de verdad y queda solo como *fallback* de arranque
si la base de datos no responde.

Se elimina el hack de `SettingsBusinessClientPage` que **muta la constante en
memoria** (`activeBranch.latitude = ...`, líneas 145-147, 158-160 y 201-203) para que
el cálculo de delivery reaccione a los cambios: el contexto recarga desde la BD.

### Modo demo

La clave `DEMO_KEYS.BRANCH` (singular) pasa a `BRANCHES` y se siembra con **dos**
sucursales de coordenadas distintas en Cuenca, cada una con sus propias zonas de
delivery y horarios. Sin esto el modo demo no puede mostrar la funcionalidad. Si un
navegador conserva la clave vieja, se resiembra.

---

## 2. Lado cliente

### Asignación automática (delivery)

Cuando el cliente marca su ubicación:

1. Se calcula la distancia Haversine desde el punto a cada sucursal activa.
2. Para cada sucursal, se busca entre **sus** zonas cuál cubre esa distancia.
3. Entre las sucursales que sí lo cubren, gana la más cercana.
4. La tarifa sale de la zona coincidente de la sucursal ganadora, **leída de la base
   de datos**.

El paso 4 corrige de raíz un bug conocido: `DeliveryService` calcula hoy contra un
array hardcodeado (`src/services/DeliveryService.ts:4`) que ya se desincronizó de la
BD una vez y provocó que se cotizara $1.50 y se cobrara $2.50. Como las zonas
dependen de la sucursal, este trabajo obliga a leerlas de la BD y cierra ese bug del
lado cliente.

### Retiro en local

En modo retiro no hay ubicación en el mapa, así que la sucursal **no puede
deducirse**: se le muestra al cliente la lista de sucursales para que elija de cuál
retira, con dirección y —si concedió geolocalización— distancia. Esta asimetría es
intencional: delivery automático, retiro explícito.

### Presentación

En el paso "Entrega" del checkout, una línea del tipo *"Te atiende: El Taca Nijo —
Matriz Cuenca · 2.1 km"* con un botón "Cambiar" que abre la lista. La sucursal
elegida viaja en `branchId` del payload (el checkout ya lo envía; hoy siempre el
fijo).

### Sin cobertura

Si ninguna sucursal cubre la dirección: mensaje explícito de fuera de cobertura y
oferta de retiro en local. Nunca un fallback silencioso a una tarifa por defecto.

### Estado Abierto/Cerrado

Hoy `SupabaseBusinessRepository.ts:117` consulta `business_hours` filtrando solo por
`business_id`, ignorando `branch_id`. Con dos sucursales de horarios distintos
mezclaría filas de ambas y daría un resultado incorrecto — es un bug latente que esta
funcionalidad activa.

Nuevo comportamiento: sin sucursal elegida, se muestra abierto si **alguna** sucursal
lo está; con sucursal elegida, se muestra el estado de esa sucursal.

### Carrito al cambiar de sucursal

Como el menú y los precios son compartidos, el carrito sigue siendo válido; solo se
recalcula el envío. (En Fase 2, con disponibilidad por sucursal, habrá que avisar si
un producto del carrito no está disponible en la nueva sucursal.)

---

## 3. Lado admin

### Selector

Desplegable en la cabecera de `AdminLayout` con las sucursales activas, persistido en
`nixgofood_admin_branch`.

### Alcance del filtrado

| Pantalla | Comportamiento |
|---|---|
| Cocina KDS | Filtra por sucursal |
| Despacho | Filtra por sucursal |
| Caja / Gestión | Filtra por sucursal |
| Resumen | Contadores de la sucursal seleccionada |
| Delivery | Edita las zonas de la sucursal seleccionada |
| Horarios | Edita los horarios de la sucursal seleccionada |
| Configuración Negocio | Solo datos del negocio; los campos de sucursal se mudan a `/admin/branches` |
| Productos, Categorías, Modificadores | **No** se filtran: el menú es del negocio |

`SettingsBusinessClientPage` edita hoy también las coordenadas y dirección de la
sucursal única. Al existir `/admin/branches`, esos campos se mudan allí y la pantalla
de Configuración queda con lo que es realmente del negocio (nombre, marca, pagos).
Es el mismo cambio que elimina la mutación en memoria de `activeBranch` descrita en
la sección 1.

Delivery y Horarios escriben hoy siempre contra `activeBranch.id`
(`DeliveryClientPage.tsx:147,169` y `HoursClientPage.tsx:74,121`); pasan a usar la
sucursal seleccionada.

### Filtrado en la consulta

`getOrders` recibe un `branchId` opcional que en Supabase añade
`.eq('branch_id', branchId)`. Filtrar en el cliente tras traer todo funcionaría hoy
con pocos pedidos, pero esa consulta ya trae la tabla entera en cada carga y el
historial solo crece.

### Realtime y alertas sonoras

Las tres pantallas operativas están suscritas a cambios en tiempo real. Sin filtrar
por sucursal, un pedido del local B haría sonar la campana y aparecer la alerta en la
cocina del local A. Los eventos entrantes se descartan si su `branch_id` no coincide
con la sucursal en pantalla.

### Pantalla `/admin/branches`

Sin ella la funcionalidad no sirve: hoy no hay forma de crear una segunda sucursal
salvo insertando SQL a mano.

Listado con alta y edición: nombre, dirección, coordenadas (reutilizando el mapa
Leaflet existente), teléfono y activo/inactivo. Va como ítem propio del nav, junto a
Delivery y Horarios, en vez de hacer crecer más Configuración Negocio.

**Desactivar, no borrar.** Una sucursal inactiva desaparece de la selección del
cliente pero sigue visible en el historial del admin. No se ofrece borrado porque los
pedidos la referencian por clave foránea y se perdería la trazabilidad de comandas
antiguas.

---

## 4. Errores, seguridad y pruebas

### Migración de datos: ninguna

El esquema ya era multi-sucursal. Los pedidos existentes ya tienen `branch_id`, las
zonas corregidas el 2026-08-19 ya cuelgan de la sucursal Matriz, y los horarios
también. Todo lo actual queda atribuido correctamente a "Matriz Cuenca" sin tocar un
registro.

### Manejo de errores

| Caso | Comportamiento |
|---|---|
| No carga la lista de sucursales | Cae al `activeBranch` constante y opera en modo una-sucursal |
| Sucursal en localStorage ya no existe o fue desactivada | Se valida al cargar y se reasigna (más cercana en cliente, primera en admin) |
| El admin desactiva la sucursal con el cliente en checkout | `create_order` ya lanza "La sucursal seleccionada no se encuentra activa"; el checkout lo captura y pide elegir otra en vez de mostrar el error crudo de Postgres |
| Ninguna sucursal cubre la dirección | Mensaje de fuera de cobertura y oferta de retiro |

### Seguridad — RLS de `branches`

**Bloqueante para la pantalla de sucursales.** Las políticas de `branches`
(`"Public read active branches"` y `"Admin manage branches"`) existen solo en
`supabase/legacy_migrations/20260819_pre_baseline/002_rls.sql`. El
`supabase/scripts/master_setup.sql` —el script realmente ejecutado en producción— no
activa RLS ni crea políticas sobre `branches`.

La Fase 1 incluye añadir RLS explícito a `branches`: lectura pública solo de
sucursales activas, escritura restringida a usuarios autenticados del negocio. Sin
esto, una pantalla de alta de sucursales podría quedar escribible con la clave
anónima.

**Hallazgo relacionado, fuera de alcance**: `master_setup.sql` define
`"Public update orders" ... USING (true) WITH CHECK (true)`, que permite a cualquiera
modificar cualquier pedido. Es un problema propio y más grave que este trabajo no
resuelve; queda registrado para atenderlo por separado.

### Pruebas

No hay runner configurado: `package.json` no tiene script `test` ni jest/vitest en
`devDependencies`, pese a existir tres archivos en `src/lib/__tests__/` que hoy no se
ejecutan.

Esta fase instala **Vitest** con su script, lo que además revive esos tres tests
huérfanos. Cobertura sobre lógica pura:

- Elección de la sucursal más cercana **entre las que cubren** la dirección (incluido
  el caso en que la más cercana no cubre y gana una más lejana que sí).
- Cálculo de tarifa por zona de la sucursal correcta.
- Validación de sucursal persistida inexistente o desactivada.
- Estado abierto/cerrado por sucursal frente a horarios distintos.

---

## Fuera de alcance (Fase 2)

- Disponibilidad de productos por sucursal (`branch_product_availability`), su toggle
  en el admin de productos, el filtrado en el menú del cliente y el aviso de carrito
  inválido al cambiar de sucursal.
- Landing y URLs por sucursal (enfoque B), si más adelante se busca SEO por ciudad.
- Asignación de usuarios del staff a una sucursal (`profiles.branch_id`) y sus
  políticas RLS.
- Corrección de la política `"Public update orders"`.
