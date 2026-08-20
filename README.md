# NIXGO FOOD - Plataforma de Pedidos Directos para Restaurantes

Plataforma web de pedidos directos para restaurantes, optimizada con diseño mobile-first, mapa real interactivo Leaflet + OpenStreetMap, cálculo de delivery Haversine por zonas, y panel operativo en tiempo real para restaurantes (*El Taca Nijo* como negocio piloto).

---

## 🛠️ Modos de Ejecución

La aplicación está diseñada para funcionar en dos modos mediante la variable de entorno `NEXT_PUBLIC_DEMO_MODE`:

### 1. DEMO MODE (Presentaciones Comerciales y Deploy Gratuito en Vercel)
Sin dependencia de Supabase ni base de datos externa. Ideal para presentaciones comerciales y demostraciones interactivas.

```env
NEXT_PUBLIC_DEMO_MODE=true
```

- **Backend**: Persistencia local autónoma mediante `localStorage` (prefijo `nixgo_food_demo_*`).
- **Autenticación**: Acceso directo al panel `/admin` con credenciales de demostración.
- **Restauración**: Incluye botón *"Restaurar datos iniciales"* en el panel `/admin`.
- **Despliegue**: Compatible con Vercel Hobby tier y Cloudflare para DNS/Dominio.

---

### 2. PRODUCTION MODE (Producción con Supabase Backend)
Conectado a base de datos PostgreSQL en Supabase, Supabase Auth, Storage y Realtime.

```env
NEXT_PUBLIC_DEMO_MODE=false
NEXT_PUBLIC_SUPABASE_URL=https://tu-proyecto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=tu-anon-key-aquí
```

- **Backend**: PostgreSQL con esquemas, índices y RLS por `business_id`.
- **Transacción RPC**: Invocación de `create_order` para validación y creación atómica en base de datos.
- **Autenticación**: Supabase Auth con middleware SSR (`@supabase/ssr`).
- **Almacenamiento**: Bucket `restaurant-media` en Supabase Storage.

---

## 🚀 Instalación y Despliegue Local

```bash
# 1. Clonar el repositorio e instalar dependencias
npm install

# 2. Iniciar servidor de desarrollo
npm run dev

# 3. Compilar para producción
npm run build
```

---

## ☁️ Despliegue en Vercel & Cloudflare

1. **Vercel**:
   - Conectar repositorio GitHub a Vercel.
   - Configurar variable de entorno: `NEXT_PUBLIC_DEMO_MODE=true`.
   - Desplegar.

2. **Cloudflare (DNS & Dominio)**:
   - Configurar registros CNAME/A apuntando a la URL pública de Vercel (`cname.vercel-dns.com`).
   - Habilitar SSL/HTTPS para garantizar la API de geolocalización (`navigator.geolocation`).

---

## 🗄️ Pasos Manuales Pendientes en Supabase (Producción)

El esquema de base de datos, las funciones RPC (`create_order`, `calculate_distance_km`) y las políticas RLS viven en `supabase/scripts/master_setup.sql`. Este script **no se ejecuta automáticamente** — hay que copiar su contenido completo y correrlo manualmente en el editor SQL del proyecto Supabase de producción cada vez que cambie.

El script es **idempotente** (usa `CREATE TABLE IF NOT EXISTS`, `ON CONFLICT DO NOTHING`, `CREATE OR REPLACE FUNCTION` y `DROP POLICY IF EXISTS` antes de cada `CREATE POLICY`), así que es seguro volver a correrlo completo sobre una base de datos ya provisionada.

**Importante:** hasta que este script se corra contra producción, cualquier tabla o política que se haya agregado recientemente (por ejemplo, las políticas RLS de `branches`) no estará activa en el entorno real, aunque el código de la aplicación ya la use.
