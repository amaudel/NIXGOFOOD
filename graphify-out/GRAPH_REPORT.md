# Graph Report - NIXGOFOOD  (2026-09-09)

## Corpus Check
- 277 files · ~230,226 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1042 nodes · 2654 edges · 99 communities (49 shown, 31 thin omitted)
- Extraction: 99% EXTRACTED · 1% INFERRED · 0% AMBIGUOUS · INFERRED: 22 edges (avg confidence: 0.85)
- Token cost: 340,215 input · 0 output

## Community Hubs (Navigation)
- Admin Routing & Tenant Auth
- Storefront Products & Cart
- Kitchen Load & Prep Timing
- Order Lifecycle & Repositories
- Admin Dashboard Pages
- Checkout & Branch Selection
- Delivery Zone & Quote Logic
- Cart UI & App Context
- Map & Geolocation UI
- Admin Orders Filtering
- Demo Order Store & API
- Business Repository (Branches/Riders)
- Order Supervision Alerts
- Frontend Tooling Dependencies
- Demo Repository Implementations
- Demo Image Generation Scripts
- New Order Audio Alerts
- TypeScript Config
- Admin Branches & Delivery Pages
- Kitchen & Dispatch Client Pages
- Marketing Landing Page
- NPM Dependencies
- Admin Menu Management
- NPM Dev Dependencies
- Header & Order Lookup
- Dispatch Checklist & Undo
- Tenant Resolution Design Concepts
- Asset Download Scripts
- Demo Seed Data
- Dispatch Sync & Broadcast
- Supabase RPC Hardening (ADR-003)
- Supabase Rollback Test Script
- Multi-Sucursal Design & Pitch
- RLS Multi-Tenant Hardening (ADR-002)
- Checkout Gating Tests
- Chat Widget Component
- Reservations & Chat Design Docs
- NPM Scripts
- Local Asset Processing Script
- Delivery Quote Tests
- Business Hours Service
- Graphify Agent Rules
- Chat Widget Design Concepts
- Demo Mode vs Production (ADR-001)
- Business CRUD Repository
- Payment Proof Storage Service
- Dynamic Prep-Time Design
- Admin Hours Page
- Dispatch Checklist Logic
- Next.js Security Config
- Delivery Location Actions
- Agent Instructions Docs
- Multi-Sucursal Plan Concepts
- Graphify Query Interface
- Test Plan Filter Script
- Graphify Explain Command
- Graphify Path Command
- Vercel Cron Config
- Hero Image Asset
- Demo Product Photo (Agua Horchata)
- Demo Product Photo (Burger Crispy)
- Demo Product Photo (Coca Cola)
- Demo Product Photo (Combo Duo Burgers)
- Demo Product (Combo Taca Fiesta)
- Demo Product Photo (Combo Taca Fiesta)
- Demo Product Photo (Hamburguesa Taca Nijo)
- Demo Product Photo (Limonada Menta)
- Demo Product Photo (Nachos Especiales)
- Demo Product Photo (Pack 10 Tacos)
- Demo Product Photo (Papas Guacamole)
- Demo Placeholder Image
- Demo Product Photo (Quesadillas)
- Demo Product Photo (Smash Burger)
- Demo Product Photo (Taco Birria)
- Demo Product Photo (Taco Cochinita)
- Demo Product Photo (Taco Pastor)
- Demo Product Photo (Taco Suadero)
- App Icon Asset (192px)
- App Icon Asset (512px)
- App Icon Asset (512px Maskable)

## God Nodes (most connected - your core abstractions)
1. `react` - 71 edges
2. `isDemoMode()` - 67 edges
3. `createClient()` - 61 edges
4. `useApp()` - 57 edges
5. `lucide-react` - 41 edges
6. `vitest` - 33 edges
7. `useBranch()` - 31 edges
8. `Order` - 30 edges
9. `OrderStatus` - 29 edges
10. `Branch` - 27 edges

## Surprising Connections (you probably didn't know these)
- `Estaciones de trabajo pitch (Mostrador/Cocina/Despacho/Reparto/Chat & reservas/Panel/Tu data)` --semantically_similar_to--> `RLS isolation by business_id`  [INFERRED] [semantically similar]
  scratch/nixgofood-ficha-comercial.html → docs/adr/002-rls-multi-tenant-business-id.md
- `Estaciones de trabajo pitch (Mostrador/Cocina/Despacho/Reparto/Chat & reservas/Panel/Tu data)` --semantically_similar_to--> `ReservationState type (parallel to OrderState)`  [INFERRED] [semantically similar]
  scratch/nixgofood-ficha-comercial.html → docs/superpowers/plans/2026-08-26-table-reservations.md
- `Estaciones de trabajo pitch (Mostrador/Cocina/Despacho/Reparto/Chat & reservas/Panel/Tu data)` --semantically_similar_to--> `prep_time_tiers table (load-based prep-time escalation, per branch)`  [INFERRED] [semantically similar]
  scratch/nixgofood-ficha-comercial.html → docs/superpowers/specs/2026-09-03-tiempos-preparacion-dinamicos-design.md
- `CURRENT_BUSINESS_ID kept only as Demo Mode fallback` --conceptually_related_to--> `Demo Mode (NEXT_PUBLIC_DEMO_MODE)`  [INFERRED]
  docs/superpowers/specs/2026-08-27-tenant-resolution-design.md → README.md
- `El Taca Nijo case study (Matriz Cuenca & Sucursal Norte)` --conceptually_related_to--> `Design: Multi-sucursal con selección de sucursales`  [INFERRED]
  scratch/nixgofood-ficha-comercial.html → docs/superpowers/specs/2026-08-19-multi-sucursal-design.md

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query Interface (CLI + MCP + graph.json)** — _agents_rules_graphify_cli_query, _agents_rules_graphify_mcp_query_graph, _agents_rules_graphify_graph_json [EXTRACTED 1.00]
- **SECURITY DEFINER RPC hardening (search_path fijo)** — docs_adr_003_search_path_fijo_security_definer_search_path_fijo, supabase_functions_create_order, supabase_functions_create_reservation, supabase_functions_verify_payment_status, supabase_functions_transition_order_status [EXTRACTED 1.00]
- **Multi-tenant isolation across layers (DB RLS, HTTP header, Durable Object id)** — docs_adr_002_rls_multi_tenant_business_id_rls_business_id, concept_x_business_id_header, concept_durable_object_tenant_isolation, concept_branches_rls_gap [INFERRED 0.85]
- **Channel-agnostic conversational agent architecture** — concept_outgoingmessage_type, concept_conversationagent_channel_agnostic, concept_web_chat_endpoint, concept_telegram_adapter, concept_chatwidget_component [EXTRACTED 1.00]

## Communities (99 total, 31 thin omitted)

### Community 0 - "Admin Routing & Tenant Auth"
Cohesion: 0.06
Nodes (52): next, @supabase/ssr, DispatchPage(), dynamic, AdminRouteLayout(), metadata, GET(), POST() (+44 more)

### Community 1 - "Storefront Products & Cart"
Cohesion: 0.06
Nodes (37): Home(), CategoryNav(), CategoryNavProps, ProductCard(), ProductCardProps, activeBranch, businessConfig, CURRENT_BUSINESS_ID (+29 more)

### Community 2 - "Kitchen Load & Prep Timing"
Cohesion: 0.06
Nodes (42): vitest, GET(), leerCoordenada(), pedir(), EscalonEditable, demoEscalonesDemora, aplicarExtraARango(), crearCacheTTL() (+34 more)

### Community 3 - "Order Lifecycle & Repositories"
Cohesion: 0.07
Nodes (26): KdsOrderElapsedTime(), KdsOrderElapsedTimeProps, getStatusLabel(), REASON_OPTIONS, RollbackOrderModal(), RollbackOrderModalProps, KDS_TIMING, KdsSeverity (+18 more)

### Community 4 - "Admin Dashboard Pages"
Cohesion: 0.10
Nodes (21): lucide-react, dynamic, dynamic, dynamic, dynamic, dynamic, AdminLayout(), AdminLayoutInner() (+13 more)

### Community 5 - "Checkout & Branch Selection"
Cohesion: 0.08
Nodes (18): @testing-library/react, CheckoutPage(), carritoGuardado, carritoGuardado, ubicacionSinReferencia, carritoGuardado, puntoEnZona1, BranchSwitcher() (+10 more)

### Community 6 - "Delivery Zone & Quote Logic"
Cohesion: 0.14
Nodes (20): BranchContextValue, BranchProvider(), BranchCoverage, evaluateBranchCoverage(), groupZonesByBranch(), hoursForBranch(), resolvePersistedBranch(), selectNearestCoveringBranch() (+12 more)

### Community 7 - "Cart UI & App Context"
Cohesion: 0.15
Nodes (16): react, AddedToCartToast(), CartDrawer(), Hero(), ModalWrapper(), ProductDetailModal(), ProductDetailModalProps, StickyCartBar() (+8 more)

### Community 8 - "Map & Geolocation UI"
Cohesion: 0.10
Nodes (17): leaflet, react-leaflet, BranchMapProps, BranchMapNoSSR, BranchMapPicker(), BranchMapPickerProps, RealMap(), RealMapProps (+9 more)

### Community 9 - "Admin Orders Filtering"
Cohesion: 0.14
Nodes (18): dynamic, OrderFilterBadge(), OrderFilterBadgeProps, formatDayLabel(), getOrderDayKey(), getStatusLabel(), OrdersClientPage(), OrdersPageContent() (+10 more)

### Community 10 - "Demo Order Store & API"
Cohesion: 0.22
Nodes (16): GET(), POST(), createDemoOrder(), executeDemoOrderAction(), getAllOrders(), getKvConfig(), getOrderByTrackingToken(), getOrdersForBusiness() (+8 more)

### Community 11 - "Business Repository (Branches/Riders)"
Cohesion: 0.14
Nodes (4): IBusinessRepository, SupabaseBusinessRepository, Branch, Motorizado

### Community 12 - "Order Supervision Alerts"
Cohesion: 0.16
Nodes (18): SUPERVISION_TIMING_CONFIG, SupervisionThresholds, findLatestTransitionTime(), formatElapsedTime(), getOrderSupervisionState(), OrderSupervisionState, SupervisionAlertType, SupervisionSeverity (+10 more)

### Community 13 - "Frontend Tooling Dependencies"
Cohesion: 0.10
Nodes (19): name, private, version, autoprefixer, clsx, jsdom, postcss, react-dom (+11 more)

### Community 15 - "Demo Image Generation Scripts"
Cohesion: 0.13
Nodes (15): @fal-ai/client, node-fetch, args, createPlaceholderImage(), downloadAndOptimize(), ensureDirectories(), forceRegenerate, generateImageViaFalApi() (+7 more)

### Community 16 - "New Order Audio Alerts"
Cohesion: 0.18
Nodes (12): AudioAlertToggle(), NewOrderAlertBanner(), NewOrderAlertBannerProps, NewOrderEmergencyModal(), NewOrderEmergencyModalProps, NewOrderAlertContext, NewOrderAlertContextType, NewOrderAlertProvider() (+4 more)

### Community 17 - "TypeScript Config"
Cohesion: 0.11
Nodes (18): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+10 more)

### Community 18 - "Admin Branches & Delivery Pages"
Cohesion: 0.16
Nodes (8): dynamic, dynamic, dynamic, BranchesClientPage(), DeliveryClientPage(), MotorizadosClientPage(), formatCoordenadas(), getBusinessRepository()

### Community 19 - "Kitchen & Dispatch Client Pages"
Cohesion: 0.15
Nodes (5): dynamic, DispatchClientPage(), KitchenClientPage(), OrderRepository, OrderStatusHistoryItem

### Community 20 - "Marketing Landing Page"
Cohesion: 0.15
Nodes (12): bricolageGrotesque, ibmPlexMono, sourceSerif4, FEATURES, FLOW_STAGES, metadata, FeatureReel(), FeatureReelItem (+4 more)

### Community 21 - "NPM Dependencies"
Cohesion: 0.12
Nodes (16): dependencies, clsx, @fal-ai/client, leaflet, lucide-react, next, node-fetch, react (+8 more)

### Community 22 - "Admin Menu Management"
Cohesion: 0.20
Nodes (7): dynamic, dynamic, MenuCategoriesClientPage(), MenuProductsClientPage(), AppProvider(), getProductRepository(), ProductRepository

### Community 23 - "NPM Dev Dependencies"
Cohesion: 0.14
Nodes (14): devDependencies, autoprefixer, jsdom, postcss, tailwindcss, @tailwindcss/postcss, @testing-library/dom, @testing-library/react (+6 more)

### Community 24 - "Header & Order Lookup"
Cohesion: 0.27
Nodes (9): ActiveOrderInfo, Header(), OrderLookupModal(), OrderLookupModalProps, getLastOrder(), getRecentOrders(), RecentOrder, removeRecentOrder() (+1 more)

### Community 25 - "Dispatch Checklist & Undo"
Cohesion: 0.27
Nodes (9): DispatchChecklistProps, OrderItemsList(), OrderItemsListProps, ActiveUndoToast, getStatusLabel(), UndoToastNotification(), UndoToastNotificationProps, useKdsFullscreen() (+1 more)

### Community 26 - "Tenant Resolution Design Concepts"
Cohesion: 0.21
Nodes (12): /api/agent-chat proxy route (NIXGOFOOD), BranchContext / BranchProvider (React), classifyHost() hostname classifier (root/admin/store/unknown), Durable Object id includes businessId:chatId for tenant isolation, getResolvedBusinessId() server helper, src/middleware.ts hostname-based tenant resolution, /negocio-no-encontrado page, Owner Telegram notification gated exclusively to El Taca Nijo (+4 more)

### Community 27 - "Asset Download Scripts"
Cohesion: 0.18
Nodes (9): sharp, ITEMS, MANIFEST_PATH, PRODUCTS_DIR, downloadBuffer(), main(), MANIFEST_PATH, MISSING_PRODUCTS (+1 more)

### Community 28 - "Demo Seed Data"
Cohesion: 0.27
Nodes (10): demoBranch, demoBranches, demoBranchNorte, demoBusiness, demoBusinessHours, demoCategories, demoDeliveryZones, demoInitialOrders (+2 more)

### Community 29 - "Dispatch Sync & Broadcast"
Cohesion: 0.25
Nodes (5): ChecklistState, DispatchCheckRepository, DemoBroadcastService, SyncEventType, SyncMessage

### Community 30 - "Supabase RPC Hardening (ADR-003)"
Cohesion: 0.24
Nodes (10): public.reservations table (zero public RLS policies), ADR-003: search_path fijo en SECURITY DEFINER, SET search_path fijo pattern for SECURITY DEFINER functions, SQL RPC create_order (SECURITY DEFINER), SQL RPC create_reservation (SECURITY DEFINER), SQL RPC transition_order_status (SECURITY DEFINER), SQL RPC verify_payment_status (SECURITY DEFINER), Migration: 20260903000200_fix_gen_random_bytes_calificado.sql (+2 more)

### Community 31 - "Supabase Rollback Test Script"
Cohesion: 0.20
Nodes (8): @supabase/supabase-js, { createClient }, envContent, envPath, envVars, fs, path, supabase

### Community 32 - "Multi-Sucursal Design & Pitch"
Cohesion: 0.25
Nodes (9): /admin/branches CRUD screen, El Taca Nijo case study (Matriz Cuenca & Sucursal Norte), Estaciones de trabajo pitch (Mostrador/Cocina/Despacho/Reparto/Chat & reservas/Panel/Tu data), "No commission to intermediaries" sales thesis, Order lifecycle flow (Nuevo→Preparando→Listo→En camino/retiro→Entregado), prep_time_tiers table (load-based prep-time escalation, per branch), ReservationState type (parallel to OrderState), Design: Multi-sucursal con selección de sucursales (+1 more)

### Community 33 - "RLS Multi-Tenant Hardening (ADR-002)"
Cohesion: 0.25
Nodes (9): branches table missing RLS policies in master_setup.sql, "Public update orders" USING(true) policy (flagged, out of scope), ADR-002: Aislamiento multi-tenant via RLS por business_id, RLS isolation by business_id, master_setup.sql manual production script, SQL function current_user_business_id() (SECURITY DEFINER), SQL function current_user_can_dispatch() (SECURITY DEFINER), Migration: 20260827000000_rls_hardening.sql (+1 more)

### Community 34 - "Checkout Gating Tests"
Cohesion: 0.22
Nodes (3): carritoGuardado, cerradoSiempre, puntoElegido

### Community 35 - "Chat Widget Component"
Cohesion: 0.31
Nodes (7): ChatEntry, ChatWidget(), handleButtonClick(), handleSubmit(), send(), getOrCreateSessionId(), OutgoingMessage

### Community 36 - "Reservations & Chat Design Docs"
Cohesion: 0.29
Nodes (8): confirm_reservation/cancel_reservation button flow, CURRENT_BUSINESS_ID kept only as Demo Mode fallback, Owner Telegram notification on reservation confirm, Plan: Table Reservations, Design: Table Reservations, Design: Web Chat Widget, Design: Resolución de Tenant por Subdominio, Design: Agente multi-tenant (chat web)

### Community 37 - "NPM Scripts"
Cohesion: 0.25
Nodes (8): scripts, build, demo:generate-images, dev, lint, start, test, test:watch

### Community 38 - "Local Asset Processing Script"
Cohesion: 0.29
Nodes (7): ensureDirs(), HERO_DIR, IMAGE_MAPPINGS, main(), MANIFEST_PATH, PRODUCTS_DIR, REMAINING_ITEMS

### Community 39 - "Delivery Quote Tests"
Cohesion: 0.25
Nodes (7): branches, cercana, lejana, puntoCubiertoPorAmbas, puntoSinCobertura, puntoSoloCercanaCubre, zonas

### Community 41 - "Graphify Agent Rules"
Cohesion: 0.29
Nodes (7): graphify update (CLI), GRAPH_REPORT.md, Graphify Knowledge Graph, graphify-out Directory, wiki/index.md, graphify SKILL.md, graphify Workflow

### Community 42 - "Chat Widget Design Concepts"
Cohesion: 0.43
Nodes (7): ChatWidget React component (NIXGOFOOD), ConversationAgent becomes channel-agnostic (accumulates OutgoingMessage[] instead of pushing to Telegram), OutgoingMessage channel-agnostic type, resolveBranchId() Worker helper (resolves active branch per business), deliverToTelegram adapter (translates OutgoingMessage[] to Telegram API calls), POST /web-chat endpoint (CORS-restricted), Plan: Web Chat Widget

### Community 43 - "Demo Mode vs Production (ADR-001)"
Cohesion: 0.33
Nodes (7): Demo mode vs Production mode pitch ("Cómo empezar"), ADR-001: Demo Mode con localStorage vs Backend Supabase, NEXT_PUBLIC_DEMO_MODE flag decision, El Taca Nijo / Burger House as dev/pilot fixtures, Demo Mode (NEXT_PUBLIC_DEMO_MODE), NIXGOFOOD README, Production Mode (Supabase Backend)

### Community 46 - "Dynamic Prep-Time Design"
Cohesion: 0.33
Nodes (6): max(automatic, manual) extra-minutes rule (never sums), Fail-open rule: a load-query failure never blocks a sale, Kitchen load = pending order_items quantity, 4h cutoff, branches.pickup_prep_min/max_minutes columns, /admin/prep-times page, Design: Tiempos de preparación dinámicos según carga de cocina

### Community 47 - "Admin Hours Page"
Cohesion: 0.40
Nodes (3): dynamic, daysOfWeekNames, HoursClientPage()

### Community 48 - "Dispatch Checklist Logic"
Cohesion: 0.67
Nodes (5): DispatchChecklist(), DRINK_KEYWORDS, isChecklistComplete(), requiresDrinksCheck(), requiresExtrasCheck()

### Community 49 - "Next.js Security Config"
Cohesion: 0.40
Nodes (3): cspHeader, nextConfig, securityHeaders

### Community 50 - "Delivery Location Actions"
Cohesion: 0.60
Nodes (4): buildWhatsappUrl(), DeliveryLocationActions(), DeliveryLocationActionsProps, DeliveryLocation

### Community 52 - "Multi-Sucursal Plan Concepts"
Cohesion: 0.67
Nodes (4): src/lib/branchSelection.ts pure branch-selection module, DeliveryService zone-based calculateDeliveryFee refactor, Demo mode seeded with two branches (Matriz + Norte), Plan: Multi-sucursal (Fase 1)

### Community 53 - "Graphify Query Interface"
Cohesion: 0.67
Nodes (3): graphify query (CLI), graph.json, query_graph (MCP)

## Knowledge Gaps
- **257 isolated node(s):** `cspHeader`, `securityHeaders`, `nextConfig`, `name`, `version` (+252 more)
  These have ≤1 connection - possible missing edges or undocumented components. (Counts symbols only; 366 node(s) total have ≤1 connection when file, concept and rationale nodes are included.)
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `react` connect `Cart UI & App Context` to `Admin Routing & Tenant Auth`, `Storefront Products & Cart`, `Checkout Gating Tests`, `Order Lifecycle & Repositories`, `Admin Dashboard Pages`, `Checkout & Branch Selection`, `Chat Widget Component`, `Map & Geolocation UI`, `Admin Orders Filtering`, `Frontend Tooling Dependencies`, `Admin Hours Page`, `New Order Audio Alerts`, `Dispatch Checklist Logic`, `Admin Branches & Delivery Pages`, `Delivery Location Actions`, `Marketing Landing Page`, `Header & Order Lookup`, `Dispatch Checklist & Undo`?**
  _High betweenness centrality (0.152) - this node is a cross-community bridge._
- **Why does `vitest` connect `Kitchen Load & Prep Timing` to `Admin Routing & Tenant Auth`, `Storefront Products & Cart`, `Checkout Gating Tests`, `Checkout & Branch Selection`, `Delivery Zone & Quote Logic`, `Cart UI & App Context`, `Delivery Quote Tests`, `Map & Geolocation UI`, `Demo Order Store & API`, `Order Supervision Alerts`, `Frontend Tooling Dependencies`, `New Order Audio Alerts`, `Admin Branches & Delivery Pages`, `Header & Order Lookup`?**
  _High betweenness centrality (0.065) - this node is a cross-community bridge._
- **Why does `isDemoMode()` connect `Admin Routing & Tenant Auth` to `Kitchen Load & Prep Timing`, `Admin Dashboard Pages`, `Checkout & Branch Selection`, `Cart UI & App Context`, `Admin Orders Filtering`, `Demo Order Store & API`, `Admin Hours Page`, `Admin Branches & Delivery Pages`, `Kitchen & Dispatch Client Pages`, `Admin Menu Management`, `Dispatch Checklist & Undo`, `Dispatch Sync & Broadcast`?**
  _High betweenness centrality (0.062) - this node is a cross-community bridge._
- **What connects `cspHeader`, `securityHeaders`, `nextConfig` to the rest of the system?**
  _257 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Admin Routing & Tenant Auth` be split into smaller, more focused modules?**
  _Cohesion score 0.06498599439775911 - nodes in this community are weakly interconnected._
- **Should `Storefront Products & Cart` be split into smaller, more focused modules?**
  _Cohesion score 0.05839727195225917 - nodes in this community are weakly interconnected._
- **Should `Kitchen Load & Prep Timing` be split into smaller, more focused modules?**
  _Cohesion score 0.05817028027498678 - nodes in this community are weakly interconnected._