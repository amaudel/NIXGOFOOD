# Graph Report - nixgofood  (2026-08-19)

## Corpus Check
- 166 files · ~148,719 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 683 nodes · 1583 edges · 75 communities (48 shown, 27 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS · INFERRED: 1 edges (avg confidence: 0.85)
- Token cost: 0 input · 620,302 output

## Community Hubs (Navigation)
- Business & Delivery Admin Repositories
- Storefront & Checkout Flow
- Admin API Routes & Security
- Demo Data Seeding & Product Repo
- Demo Business/Order Repo & Settings
- NPM Runtime Dependencies
- NPM Dev/Build Tooling
- TypeScript Config
- Menu Management (Categories & Products)
- Order Supervision Timing & Tests
- Admin Orders Dashboard & Filters
- Admin Layout & Alerts
- Kitchen/Dispatch Pages & Broadcast
- Order Transitions & Repo Interfaces
- Order Tracking & Repo Implementation
- README Project Overview
- KDS Timing & Elapsed Time
- Order Repository Interface
- Supabase Prod Rollback Test Script
- Dispatch Checklist Logic
- Map Components (Leaflet)
- Local Asset Processing Script
- Graphify Rules Reference
- Order Rollback Modal
- Asset Download Script
- Local Food Asset Creation Script
- Admin Dashboard Page
- Order Supervision Phase 2.1 Tests
- Next.js Agent Rules Integration
- Graphify Query Interface
- Test Plan Filter Script
- Next.js Middleware
- Graphify Explain Interface
- Graphify Path Interface
- Next.js Config
- Vercel Cron Config
- Hero Banner Image
- Agua de Horchata Photo
- Crispy Burger Photo
- Coca-Cola Photo
- Combo Duo Burgers Photo
- Combo Taca Fiesta (Product)
- Combo Taca Fiesta Photo
- Hamburguesa Tacanijo Photo
- Limonada con Menta Photo
- Nachos Especiales Photo
- Pack 10 Tacos Photo
- Papas Rusticas con Guacamole Photo
- Placeholder Image
- Quesadillas de Harina Photo
- Smash Burger Mexicana Photo
- Taco Birria Photo
- Taco Cochinita Photo
- Taco Pastor Photo
- Taco Suadero Photo

## God Nodes (most connected - your core abstractions)
1. `isDemoMode()` - 56 edges
2. `createClient()` - 51 edges
3. `OrderStatus` - 28 edges
4. `Order` - 28 edges
5. `useApp()` - 25 edges
6. `CURRENT_BUSINESS_ID` - 22 edges
7. `Product` - 21 edges
8. `createClient()` - 19 edges
9. `Category` - 19 edges
10. `DemoOrderRepository` - 17 edges

## Surprising Connections (you probably didn't know these)
- `getBusinessRepository()` --calls--> `isDemoMode()`  [EXTRACTED]
  src/repositories/factory.ts → src/config/demo.ts
- `CheckoutPage()` --calls--> `isDemoMode()`  [EXTRACTED]
  src/app/checkout/page.tsx → src/config/demo.ts
- `OrderSuccessPage()` --calls--> `isDemoMode()`  [EXTRACTED]
  src/app/order/[id]/page.tsx → src/config/demo.ts
- `Home()` --calls--> `useApp()`  [EXTRACTED]
  src/app/page.tsx → src/context/AppContext.tsx
- `ActiveOrderInfo` --inherits--> `RecentOrder`  [EXTRACTED]
  src/components/ActiveOrderBar.tsx → src/utils/recentOrders.ts

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Graphify Query Interface (CLI + MCP + graph.json)** — _agents_rules_graphify_cli_query, _agents_rules_graphify_mcp_query_graph, _agents_rules_graphify_graph_json [EXTRACTED 1.00]
- **NIXGO FOOD Dual-Mode Architecture** — readme_demo_mode, readme_production_mode, readme_next_public_demo_mode [EXTRACTED 1.00]
- **Supabase Production Backend Stack** — readme_supabase, readme_supabase_auth, readme_supabase_storage, readme_create_order_rpc [EXTRACTED 1.00]

## Communities (75 total, 27 thin omitted)

### Community 0 - "Business & Delivery Admin Repositories"
Cohesion: 0.06
Nodes (24): dynamic, dynamic, dynamic, DeliveryClientPage(), daysOfWeekNames, LoginClientPage(), MenuModifiersClientPage(), activeBranch (+16 more)

### Community 1 - "Storefront & Checkout Flow"
Cohesion: 0.05
Nodes (43): CheckoutPage(), metadata, Home(), ActiveOrderBar(), checkActiveOrder(), ActiveOrderInfo, CartDrawer(), CategoryNav() (+35 more)

### Community 2 - "Admin API Routes & Security"
Cohesion: 0.12
Nodes (29): DispatchPage(), dynamic, GET(), POST(), GET(), POST(), POST(), GET() (+21 more)

### Community 3 - "Demo Data Seeding & Product Repo"
Cohesion: 0.07
Nodes (24): args, createPlaceholderImage(), downloadAndOptimize(), ensureDirectories(), forceRegenerate, generateImageViaFalApi(), generateImageWithRetry(), HERO_CONFIG (+16 more)

### Community 4 - "Demo Business/Order Repo & Settings"
Cohesion: 0.11
Nodes (8): dynamic, dynamic, HoursClientPage(), SettingsBusinessClientPage(), loadData(), checkStatus(), DemoOrderRepository, DemoProductRepository

### Community 5 - "NPM Runtime Dependencies"
Cohesion: 0.06
Nodes (31): clsx, @fal-ai/client, leaflet, lucide-react, node-fetch, dependencies, clsx, @fal-ai/client (+23 more)

### Community 6 - "NPM Dev/Build Tooling"
Cohesion: 0.07
Nodes (28): autoprefixer, devDependencies, autoprefixer, postcss, tailwindcss, @tailwindcss/postcss, @types/leaflet, @types/node (+20 more)

### Community 7 - "TypeScript Config"
Cohesion: 0.07
Nodes (27): dom, dom.iterable, esnext, .next/dev/types/**/*.ts, next-env.d.ts, .next/types/**/*.ts, node_modules, **/*.ts (+19 more)

### Community 8 - "Menu Management (Categories & Products)"
Cohesion: 0.16
Nodes (10): dynamic, dynamic, MenuCategoriesClientPage(), MenuProductsClientPage(), CategoryNavProps, AppProvider(), getBusinessRepository(), getProductRepository() (+2 more)

### Community 9 - "Order Supervision Timing & Tests"
Cohesion: 0.16
Nodes (18): SUPERVISION_TIMING_CONFIG, SupervisionThresholds, findLatestTransitionTime(), formatElapsedTime(), getOrderSupervisionState(), OrderSupervisionState, SupervisionAlertType, SupervisionSeverity (+10 more)

### Community 10 - "Admin Orders Dashboard & Filters"
Cohesion: 0.15
Nodes (15): dynamic, OrderFilterBadge(), OrderFilterBadgeProps, getStatusLabel(), OrdersClientPage(), filterOrdersByTab(), formatBadgeCount(), getOrderFilterCount() (+7 more)

### Community 11 - "Admin Layout & Alerts"
Cohesion: 0.18
Nodes (15): AdminLayoutInner(), navItems, AudioAlertToggle(), NewOrderEmergencyModal(), NewOrderEmergencyModalProps, KdsClockContext, KdsClockContextValue, KdsClockProvider() (+7 more)

### Community 12 - "Kitchen/Dispatch Pages & Broadcast"
Cohesion: 0.17
Nodes (11): dynamic, AdminLayout(), NewOrderAlertBanner(), NewOrderAlertBannerProps, OrderItemsList(), ActiveUndoToast, getStatusLabel(), UndoToastNotification() (+3 more)

### Community 13 - "Order Transitions & Repo Interfaces"
Cohesion: 0.24
Nodes (13): AppContext, AppContextType, DEFAULT_LOCATION, isValidForwardTransition(), ORDER_TRANSITION_RULES, OrderAction, TransitionRule, ExecuteActionParams (+5 more)

### Community 14 - "Order Tracking & Repo Implementation"
Cohesion: 0.25
Nodes (7): OrderSuccessPage(), statusSteps, KitchenClientPage(), OrdersPageContent(), getOrderRepository(), OrderRepository, DemoBroadcastService

### Community 15 - "README Project Overview"
Cohesion: 0.14
Nodes (15): /admin Panel, Cloudflare DNS, create_order RPC, DEMO MODE, El Taca Nijo (Pilot Business), Haversine Delivery Calculation, Leaflet + OpenStreetMap Map, localStorage Persistence (+7 more)

### Community 16 - "KDS Timing & Elapsed Time"
Cohesion: 0.33
Nodes (8): KdsOrderElapsedTime(), KdsOrderElapsedTimeProps, KDS_TIMING, KdsSeverity, KdsTimeAnalysis, useKdsClock(), calculateKdsTimeAnalysis(), DeliveryMethod

### Community 18 - "Supabase Prod Rollback Test Script"
Cohesion: 0.22
Nodes (7): { createClient }, envContent, envPath, envVars, fs, path, supabase

### Community 19 - "Dispatch Checklist Logic"
Cohesion: 0.39
Nodes (8): DispatchChecklist(), DispatchChecklistProps, DRINK_KEYWORDS, isChecklistComplete(), requiresDrinksCheck(), requiresExtrasCheck(), OrderItemsListProps, OrderItem

### Community 20 - "Map Components (Leaflet)"
Cohesion: 0.25
Nodes (4): RealMapProps, RealMapNoSSR, RealMapWrapper(), RealMapWrapperProps

### Community 21 - "Local Asset Processing Script"
Cohesion: 0.29
Nodes (7): ensureDirs(), HERO_DIR, IMAGE_MAPPINGS, main(), MANIFEST_PATH, PRODUCTS_DIR, REMAINING_ITEMS

### Community 22 - "Graphify Rules Reference"
Cohesion: 0.29
Nodes (7): graphify update (CLI), GRAPH_REPORT.md, Graphify Knowledge Graph, graphify-out Directory, wiki/index.md, graphify SKILL.md, graphify Workflow

### Community 23 - "Order Rollback Modal"
Cohesion: 0.43
Nodes (6): getStatusLabel(), REASON_OPTIONS, RollbackOrderModal(), RollbackOrderModalProps, AdminRole, Order

### Community 24 - "Asset Download Script"
Cohesion: 0.40
Nodes (5): downloadBuffer(), main(), MANIFEST_PATH, MISSING_PRODUCTS, PRODUCTS_DIR

### Community 25 - "Local Food Asset Creation Script"
Cohesion: 0.40
Nodes (3): ITEMS, MANIFEST_PATH, PRODUCTS_DIR

### Community 27 - "Order Supervision Phase 2.1 Tests"
Cohesion: 0.60
Nodes (4): assertEqual(), runPhase2_1Tests(), evaluateSoundPolicy(), triggerChimeMock()

### Community 28 - "Next.js Agent Rules Integration"
Cohesion: 0.50
Nodes (3): generate-agent-files.js, node_modules/next/dist/docs/, Next.js Agent Rules (Breaking Changes Notice)

### Community 29 - "Graphify Query Interface"
Cohesion: 0.67
Nodes (3): graphify query (CLI), graph.json, query_graph (MCP)

## Knowledge Gaps
- **176 isolated node(s):** `nextConfig`, `name`, `version`, `private`, `dev` (+171 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **27 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `isDemoMode()` connect `Admin API Routes & Security` to `Business & Delivery Admin Repositories`, `Storefront & Checkout Flow`, `Demo Business/Order Repo & Settings`, `Menu Management (Categories & Products)`, `Admin Orders Dashboard & Filters`, `Admin Layout & Alerts`, `Kitchen/Dispatch Pages & Broadcast`, `Order Tracking & Repo Implementation`, `Admin Dashboard Page`?**
  _High betweenness centrality (0.057) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Business & Delivery Admin Repositories` to `Storefront & Checkout Flow`, `Admin API Routes & Security`, `Demo Business/Order Repo & Settings`, `Menu Management (Categories & Products)`, `Admin Orders Dashboard & Filters`, `Admin Layout & Alerts`, `Kitchen/Dispatch Pages & Broadcast`, `Order Tracking & Repo Implementation`, `Admin Dashboard Page`?**
  _High betweenness centrality (0.042) - this node is a cross-community bridge._
- **Why does `Order` connect `Order Rollback Modal` to `Business & Delivery Admin Repositories`, `Storefront & Checkout Flow`, `Demo Data Seeding & Product Repo`, `Demo Business/Order Repo & Settings`, `Order Supervision Timing & Tests`, `Admin Orders Dashboard & Filters`, `Kitchen/Dispatch Pages & Broadcast`, `Order Transitions & Repo Interfaces`, `Order Tracking & Repo Implementation`, `Order Repository Interface`, `Admin Dashboard Page`, `Order Supervision Phase 2.1 Tests`?**
  _High betweenness centrality (0.025) - this node is a cross-community bridge._
- **What connects `nextConfig`, `name`, `version` to the rest of the system?**
  _176 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Business & Delivery Admin Repositories` be split into smaller, more focused modules?**
  _Cohesion score 0.0624048706240487 - nodes in this community are weakly interconnected._
- **Should `Storefront & Checkout Flow` be split into smaller, more focused modules?**
  _Cohesion score 0.05403348554033485 - nodes in this community are weakly interconnected._
- **Should `Admin API Routes & Security` be split into smaller, more focused modules?**
  _Cohesion score 0.12222222222222222 - nodes in this community are weakly interconnected._