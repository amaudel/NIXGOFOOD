## Actualización 2026-09-09 — respuesta de campo (no oficial de SmartCorp)

Al consultar directamente a un restaurante que usa Smartmenú (vía WhatsApp, usando la pregunta clave de este reporte), la respuesta fue **NO**: Smartmenú no permite que un sistema externo cree pedidos/ventas en su plataforma, porque **tienen su propia app de delivery** y una API inbound abierta competiría con ese producto.

Esta respuesta viene del restaurante/usuario final, no de una confirmación técnica formal por escrito de SmartCorp, pero es coherente con lo que ya indicaba la evidencia pública (ninguna documentación de API inbound) y aporta además el motivo comercial.

**Efecto sobre el veredicto de este reporte:** la integración directa NixGoFood → Smartmenú vía API queda **descartada en la práctica** para restaurantes que usan Smartmenú, salvo cambio futuro de política de SmartCorp. Ver sección "Roadmap y condición para implementar Smartmenú" — Fase 0 no se cumple y no corresponde avanzar a Fase 1.

**Alternativa recomendada:** evaluar que NixGoFood sea `fiscal_owner` directo vía SRI (`NixGoSriAdapter`, ya contemplado conceptualmente en este reporte) para pedidos que se originan en NixGoFood, en vez de depender de que Smartmenú reciba el pedido. Esto resuelve la objeción original (que el restaurante tenga que digitar pedidos manualmente a facturación) sin necesitar la cooperación de SmartCorp.

---

# Investigación técnica de integración NixGoFood ↔ Smartmenú Ecuador / SmartCorp

## Resumen ejecutivo y conclusión de viabilidad

**Fecha de investigación:** 9 de septiembre de 2026, Ecuador.  
**Objetivo evaluado:** mantener a NixGoFood como canal de adquisición, e-commerce y pedidos, y utilizar Smartmenú como sistema operacional del restaurante, POS, comandas, inventario y facturación electrónica.

### Veredicto

**Viabilidad actual: MEDIA, CONDICIONADA.**

La razón principal no es que Smartmenú carezca de las funciones necesarias. Al contrario: SmartCorp publica que Smartmenú maneja POS, menú con categorías/productos, comandas, inventario por receta, cajas y facturación electrónica; sus aplicaciones oficiales también demuestran flujos de pedidos hacia cocina y conexión entre POS y Delivery. citeturn30view5turn30view6turn30view2turn30view3

El bloqueo está en otro lugar: **no encontré documentación pública verificable que demuestre una API de entrada de Smartmenú mediante la cual un tercero pueda crear pedidos o ventas en Smartmenú**. Las búsquedas realizadas sobre los dominios oficiales, `smartmenucloud.com`, documentación indexada, Swagger/OpenAPI, Postman, GitHub y búsquedas específicas de API/webhooks no arrojaron un contrato público utilizable para construir el `SmartmenuAdapter`. En consecuencia, cualquier endpoint, método de autenticación, payload o URL que implementáramos hoy sería especulativo.

Más importante todavía, la evidencia pública sobre integración apunta explícitamente a una dirección diferente:

> **Smartmenu Kiosko → API de un sistema POS externo**

La página oficial de Kiosko dice que es “integrable con otros sistemas de puntos de venta” y, de manera aún más explícita, que su aplicación puede integrarse **“a la API de cualquier software de punto de venta”**. citeturn32search0

La aplicación oficial de Kiosko en Google Play también afirma que puede integrarse mediante API a otros sistemas, pero la redacción del sitio oficial es más precisa respecto de la dirección de la integración. citeturn33search0

Por tanto:

| Pregunta | Conclusión |
|---|---|
| ¿Smartmenú tiene capacidades operativas de POS, pedidos, comandas, inventario y factura? | **CONFIRMADO POR FUENTE OFICIAL**. citeturn30view5turn30view6turn30view2turn30view3 |
| ¿Smartmenu Kiosko puede integrarse con APIs de otros POS? | **CONFIRMADO POR FUENTE OFICIAL**. citeturn32search0turn33search0 |
| ¿Existe públicamente una API Smartmenú para que NixGoFood cree pedidos/ventas? | **NO CONFIRMADO**. |
| ¿La integración Kiosko→otro POS demuestra que también existe tercero→Smartmenú? | **No. Esa equivalencia sería incorrecta.** |
| ¿Podemos escribir hoy un `SmartmenuAdapter` real? | **No. REQUIERE INFORMACIÓN DE SMARTCORP.** |
| ¿Tiene sentido diseñar ya el Integration Gateway desacoplado? | **Sí.** La arquitectura puede quedar preparada sin inventar el protocolo de Smartmenú. |
| ¿Debe NixGoFood emitir la factura además de Smartmenú? | **No para una misma venta.** La arquitectura debe definir un único `fiscal_owner`. |
| ¿Puede Smartmenú facturar automáticamente un pedido originado por API? | **NO CONFIRMADO / REQUIERE INFORMACIÓN DE SMARTCORP.** |

La decisión correcta hoy es, por tanto:

**aprobar la arquitectura del Integration Gateway, modelos, contratos internos, idempotencia, cola, mocks y pruebas; no aprobar todavía la integración Smartmenú de producción.**

### Distinción crítica sobre la dirección de integración

Esta es probablemente la conclusión más importante de toda la investigación.

```text
EVIDENCIA PÚBLICA ENCONTRADA

Smartmenu Kiosko
       │
       │ consume / se integra a
       ▼
API de otro software POS
```

La página de Smartmenu Kiosko no dice que el POS Smartmenú exponga una API receptora a terceros; dice que **la aplicación Kiosko se integra a la API del software POS**. citeturn32search0

Lo que NixGoFood necesita es justamente lo contrario:

```text
INTEGRACIÓN QUE NIXGOFOOD NECESITA

NixGoFood
    │
    │ crea pedido / venta
    ▼
API Smartmenú
    │
    ▼
POS → Comanda → Inventario → Factura
```

**Ese segundo flujo permanece NO CONFIRMADO.**

No sería intelectualmente válido inferir:

```text
Smartmenu puede consumir APIs externas
             ≠
Smartmenu necesariamente expone una API externa
```

Las dos arquitecturas requieren contratos, autenticación, modelos y garantías completamente diferentes.

### Estado del análisis del código de NixGoFood

Intenté localizar el proyecto NixGoFood mediante el conector GitHub disponible, pero el acceso al repositorio requirió interacción/autorización adicional y no fue posible leer el código durante esta investigación. Tampoco se proporcionó un repositorio o archivos fuente directamente en esta conversación.

Por ello **no voy a afirmar que se recorrió el proyecto**, ni que conozco sus tablas actuales más allá del contexto que proporcionaste.

Esto afecta específicamente las siguientes tareas:

- todavía no es posible determinar qué tablas actuales pueden reutilizarse;
- no es posible validar cómo se crea exactamente `orders`;
- no es posible verificar el cálculo actual de precios;
- no es posible revisar las políticas RLS existentes;
- no es posible identificar Edge Functions existentes;
- no es posible aprobar migraciones SQL concretas sin riesgo de duplicar estructuras.

Por esa razón, el modelo de datos de este reporte es **arquitectura conceptual propuesta**, no una migración aprobada.

No incluyo SQL de migración en esta etapa, de acuerdo con tu restricción.

## Evidencia encontrada y capacidades reales de Smartmenú

### Evidencia pública relevante

| Fuente | Hallazgo | URL | Fecha / vigencia observada | Confianza |
|---|---|---|---|---|
| Smartmenú Ecuador, sitio oficial | Smartmenú se presenta como software gastronómico con menú, categorías/productos, inventario por receta, comandas y facturación electrónica. | `https://smartmenuec.com/` | Consultado 2026-09-09 | **Alta — CONFIRMADO POR FUENTE OFICIAL** citeturn30view0 |
| SmartCorp, página corporativa | SmartCorp describe Smartmenú como ecosistema que integra POS, autoservicio, web delivery y control administrativo. | `https://smartcorp.com.ec/index.php/nosotros/` | Consultado 2026-09-09 | **Alta — CONFIRMADO POR FUENTE OFICIAL** citeturn30view5 |
| SmartCorp, licencia White Smartmenú | La oferta enumera menú con categorías/productos, facturación electrónica, comandas, apertura/cierre de caja, inventario por receta y una caja. | `https://smartcorp.com.ec/index.php/producto/licencia-white-smartmenu/` | Consultado 2026-09-09 | **Alta — CONFIRMADO POR FUENTE OFICIAL** citeturn30view6 |
| Smartmenú Kiosko, sitio oficial | Kiosko se vincula con Smartmenú y es integrable con otros POS. Permite aderezos, extras, comentarios, comprobantes y sistemas de pago. | `https://smartmenuec.com/kiosko` | Consultado 2026-09-09 | **Alta — CONFIRMADO POR FUENTE OFICIAL** citeturn32search0 |
| Smartmenú Kiosko, sitio oficial | La descripción dice expresamente que la aplicación puede integrarse **a la API de cualquier software POS**. | mismo URL | Consultado 2026-09-09 | **Muy alta para la dirección Kiosko→POS externo** citeturn32search0 |
| Google Play, Smartmenu Kiosco | Aplicación oficial de SMART SOLUCIONES; dice que puede integrarse mediante API y soporta Payphone/Datafast. | `https://play.google.com/store/apps/details?id=com.smartmenu.kiosko` | Actualizada 2026-09-01 | **Alta como fuente oficial del producto** citeturn33search0 |
| Google Play, Smartmenu POS | Aplicación POS oficial; cubre toma de pedidos, visores de comandas y conexión con la app Delivery. | `https://play.google.com/store/apps/details?id=com.smartmenu.pos` | Actualizada 2025-12-17 | **Alta** citeturn30view2 |
| Google Play, Smartmenu Mesero | Se conecta con el ERP y las comandas tomadas por meseros se reflejan automáticamente en cocina/barra. | `https://play.google.com/store/apps/details?id=com.smartmenuec.meserov2.app` | Actualizada 2026-08-19 | **Alta** citeturn30view3 |
| Google Play, Smartmenu Delivery | Aplicación oficial para pedidos a domicilio de múltiples restaurantes. | `https://play.google.com/store/apps/details?id=com.smartmenu.delivery` | Actualizada 2026-08-21 | **Alta para existencia de Delivery; nula para API externa** citeturn33search1 |
| App Store, Smartmenu Delivery | SMARTCORPEC S.A.S. figura como desarrollador; la app permite pedidos, notificaciones de estado y pagos. | `https://apps.apple.com/ec/app/smartmenu-delivery/id6747273477` | Versión visible 2025-12-20 | **Alta** citeturn33search3 |
| Política de privacidad Smartmenú | El ecosistema maneja identificación, contacto y datos destinados a facturación electrónica y operación de pedidos. | `https://smartmenuec.com/privacy-policy` | Consultado 2026-09-09 | **Alta para tratamiento funcional de datos; no demuestra API** citeturn0search3 |
| SRI, Facturación Electrónica | El esquema electrónico vigente es Off-line y la Ficha Técnica vigente publicada es la versión 2.34, actualizada en julio de 2026. | `https://www.sri.gob.ec/facturacion-electronica` | Julio 2026 / consultado 2026-09-09 | **Muy alta — documentación regulatoria oficial** citeturn31view0turn31view1 |

También aparecieron proyectos y documentos en Internet con nombres “SmartMenu” pertenecientes a productos completamente distintos —por ejemplo Ágora SmartMenu y repositorios genéricos de GitHub—. Se descartaron deliberadamente para evitar atribuir a SmartCorp Ecuador capacidades de terceros.

### Lo que sí sabemos del modelo funcional de Smartmenú

**CONFIRMADO POR FUENTE OFICIAL:** Smartmenú posee un modelo de menú con categorías y productos, y su oferta comercial publica inventario por receta, comandas, cajas y facturación electrónica. citeturn30view6

**CONFIRMADO POR FUENTE OFICIAL:** el sitio de Kiosko menciona personalización mediante aderezos, extras y comentarios. citeturn32search0

**CONFIRMADO POR FUENTE OFICIAL:** Smartmenu Mesero puede generar pedidos que terminan reflejándose automáticamente en pantallas de cocina/barra dentro de su propio ecosistema. citeturn30view3

**CONFIRMADO POR FUENTE OFICIAL:** Smartmenu POS se conecta con la aplicación Smartmenu Delivery. citeturn30view2

**CONFIRMADO POR FUENTE OFICIAL:** Smartmenú ofrece facturación electrónica como módulo comercial. citeturn30view6

Nada de lo anterior, sin embargo, demuestra que esas capacidades estén expuestas a terceros mediante una API.

### Matriz de las capacidades solicitadas

En la siguiente tabla, “capacidad interna” y “capacidad API” se distinguen deliberadamente. La existencia de una pantalla o módulo no equivale a disponer de un endpoint.

| Función solicitada | Resultado de la investigación | Clasificación |
|---|---|---|
| Consultar productos | Smartmenú tiene productos, pero no encontré contrato público para consultarlos externamente. citeturn30view6 | **CONFIRMADO POR FUENTE OFICIAL** para existencia; **NO CONFIRMADO** para API |
| Consultar categorías | Categorías forman parte del módulo Menú; lectura externa no documentada. citeturn30view6 | **CONFIRMADO POR FUENTE OFICIAL / NO CONFIRMADO API** |
| Consultar precios | Los productos necesariamente participan en ventas, pero no se encontró API pública de precios. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Consultar modificadores/extras | Kiosko maneja aderezos y extras; no hay documentación pública para obtenerlos de Smartmenú vía API. citeturn32search0 | **CONFIRMADO POR FUENTE OFICIAL / NO CONFIRMADO API** |
| Consultar variedades | La web comercial refiere variedades como parte del modelado del menú, pero no se encontró contrato API público. citeturn30view0 | **CONFIRMADO POR FUENTE OFICIAL / NO CONFIRMADO API** |
| Consultar combos | Smartmenú publica soporte funcional para combos, pero no una API de lectura. citeturn30view0 | **CONFIRMADO POR FUENTE OFICIAL / NO CONFIRMADO API** |
| Consultar stock | Existe inventario por receta; lectura de stock externa no está documentada públicamente. citeturn30view6 | **CONFIRMADO POR FUENTE OFICIAL / NO CONFIRMADO API** |
| Consultar disponibilidad | No encontré contrato público de disponibilidad `available/sold_out`. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Crear pedidos | Smartmenú crea pedidos internamente mediante Mesero/POS/Delivery, pero no se demostró creación desde terceros. citeturn30view2turn30view3 | **CONFIRMADO POR FUENTE OFICIAL internamente / NO CONFIRMADO API externa** |
| Crear ventas | POS y facturación implican ventas internas; creación de venta externa no documentada. citeturn30view6 | **NO CONFIRMADO para terceros** |
| Enviar a comandas | Mesero envía comandas dentro del ecosistema. citeturn30view3 | **CONFIRMADO POR FUENTE OFICIAL internamente / NO CONFIRMADO desde API** |
| Identificar sucursal | No encontré documentación de un `branch_id` externo o equivalente. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Identificar caja/POS | SmartCorp comercializa licencias con cajas, pero no publica identificadores/API. citeturn30view6 | **CONFIRMADO POR FUENTE OFICIAL existencia / NO CONFIRMADO identificación API** |
| Enviar datos de cliente | Smartmenú utiliza datos de cliente y facturación en sus servicios; payload externo no publicado. citeturn0search3 | **CONFIRMADO POR FUENTE OFICIAL funcionalmente / NO CONFIRMADO API** |
| Enviar información de facturación | Mismo resultado: Smartmenú procesa información para facturación, pero no hay esquema API público. citeturn0search3 | **NO CONFIRMADO API** |
| Seleccionar forma de pago | Kiosko publica integración con sistemas de pago; no existe contrato público para reportar una forma de pago desde terceros. citeturn32search0turn33search0 | **CONFIRMADO funcionalmente / NO CONFIRMADO API** |
| Enviar cargo de delivery | No se encontró campo o contrato público Smartmenú. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Obtener estado del pedido | Las apps manejan estados y Delivery puede notificar cambios, pero no existe API pública documentada de consulta. citeturn33search3turn0search3 | **CONFIRMADO funcionalmente / NO CONFIRMADO API** |
| Obtener información de factura | Smartmenú factura electrónicamente; recuperación externa no documentada. citeturn30view6 | **NO CONFIRMADO API** |
| Obtener número de factura | Debe existir en el proceso fiscal, pero exposición por Smartmenú no está demostrada. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Obtener clave de acceso SRI | El comprobante electrónico ecuatoriano contiene clave de acceso; que Smartmenú la exponga a NixGoFood no está documentado. citeturn29view2turn29view0 | **CONFIRMADO POR DOCUMENTACIÓN SRI / NO CONFIRMADO API Smartmenú** |
| Obtener XML | Smartmenú genera facturación electrónica, pero no encontré API de descarga de XML. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Obtener RIDE | El RIDE forma parte del ecosistema de comprobantes electrónicos SRI, pero no se encontró método Smartmenú para descargarlo externamente. citeturn31view2 | **CONFIRMADO POR DOCUMENTACIÓN SRI / NO CONFIRMADO Smartmenú** |
| Recibir webhooks | No se localizaron eventos, firma, callbacks ni documentación pública. | **NO CONFIRMADO / REQUIERE INFORMACIÓN DE SMARTCORP** |
| Autenticación API | No se localizaron especificaciones públicas de API key, OAuth, JWT, Basic, certificado, etc. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Sandbox | No se encontró documentación pública de sandbox Smartmenú. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Rate limits | No encontrados públicamente. | **REQUIERE INFORMACIÓN DE SMARTCORP** |
| Idempotencia | No documentada públicamente. | **REQUIERE INFORMACIÓN DE SMARTCORP** |

### Swagger, OpenAPI, Postman, SDK y webhooks

A fecha de esta investigación, **no localicé una especificación pública indexable** de SmartCorp Ecuador que proporcione:

`OpenAPI`, `Swagger`, colección Postman, SDK, lista de endpoints, modelos JSON/XML, mecanismo de autenticación, política de idempotencia, rate limits, códigos de error, webhooks o URLs de sandbox.

Esto debe interpretarse cuidadosamente:

**NO CONFIRMADO no significa que SmartCorp no tenga una API.**

Puede existir:

- una API privada para partners;
- una API entregada únicamente bajo convenio;
- documentación no indexada;
- integración implementada a medida;
- acceso limitado por cliente;
- un módulo opcional;
- o solamente el modelo inverso Kiosko→API del POS.

El sitio de Kiosko incluso muestra un botón “Guía de integración”, lo que confirma que SmartCorp dispone de material de integración de algún tipo; sin embargo, la evidencia indexada que pude verificar no expuso su contenido técnico ni demostró que esa guía describa una API de entrada a Smartmenú. citeturn32search0

## Información faltante y solicitud técnica a SmartCorp

Antes de programar el adaptador real necesitamos convertir la gran cantidad de `NO CONFIRMADO` en respuestas contractuales.

### Preguntas obligatorias a SmartCorp

La primera pregunta debe formularse antes que cualquier detalle de endpoints:

**“¿Smartmenú expone actualmente una API soportada oficialmente para que una plataforma externa cree pedidos o ventas dentro de Smartmenú, o las integraciones API disponibles se limitan a que aplicaciones Smartmenú, como Kiosko, consuman APIs de otros POS?”**

Esa respuesta determina si la arquitectura deseada es directamente viable.

Después deben solicitarse, como mínimo, estas aclaraciones:

| Área | Pregunta concreta |
|---|---|
| Dirección | ¿Existe una API oficialmente soportada para **tercero → Smartmenú**? |
| Pedidos | ¿Puede un tercero crear un pedido que aparezca en Smartmenú POS? |
| Ventas | ¿Existe una operación separada para crear una venta o cerrar/cobrar un pedido? |
| Comandas | ¿Un pedido creado externamente dispara automáticamente las comandas de cocina/barra? |
| Catálogo | ¿Existe API para categorías, productos, precios, variedades, modificadores, extras y combos? |
| Stock | ¿Existe consulta de stock? ¿Stock físico, stock por receta o solamente disponibilidad? |
| Agotados | ¿Existe indicador disponible/no disponible por producto y por sucursal? |
| Identificadores | ¿Qué ID estable debe guardar el integrador para productos, categorías, modificadores y opciones? |
| SKU | ¿El SKU/código de producto es único globalmente, por negocio o por sucursal? |
| Sucursales | ¿Cómo se identifica una sucursal/restaurante/local en las llamadas de integración? |
| Cajas | ¿Cómo se identifica la caja o punto de venta receptor? |
| Comandas | ¿Cómo se especifica punto de preparación, impresora o KDS si fuera necesario? |
| Facturación | ¿Puede un pedido o venta creado por API generar factura electrónica automáticamente? |
| Fiscal | ¿Cómo se identifica establecimiento y punto de emisión? |
| Secuencial | ¿Lo controla exclusivamente Smartmenú? |
| Cliente | ¿Qué campos del cliente acepta/requiere la API? |
| Identificación | ¿Qué valores utiliza Smartmenú para cédula, RUC, pasaporte y consumidor final? |
| Pago | ¿Qué catálogo de formas de pago acepta? |
| Pago externo | Si NixGoFood ya cobró el pedido, ¿cómo se reporta ese pago sin volver a cobrarlo? |
| Delivery | ¿El cargo de delivery se envía como línea, servicio, cargo separado u otro concepto? |
| Propina | ¿Cómo se representa la propina? |
| Descuentos | ¿Acepta descuentos de línea, de pedido, promociones o cupones originados externamente? |
| Impuestos | ¿Smartmenú recalcula impuestos o acepta totales calculados por el canal? |
| Precio | ¿Qué sucede si NixGoFood envía un precio diferente al registrado en Smartmenú? |
| Factura | ¿Qué respuesta confirma que la factura quedó generada/autorizada? |
| Número | ¿Puede recuperarse establecimiento-punto de emisión-secuencial? |
| SRI | ¿Puede obtenerse la clave de acceso/autorización? |
| XML | ¿Puede recuperarse el XML firmado/autorizado? |
| RIDE | ¿Puede recuperarse el PDF/RIDE? |
| Factura asincrónica | Si la factura tarda en autorizarse, ¿cómo se consulta el estado posteriormente? |
| Estado de pedido | ¿Qué estados soporta Smartmenú y cuáles son sus transiciones? |
| Cancelaciones | ¿Puede cancelarse un pedido vía API? ¿Hasta qué estado? |
| Webhooks | ¿Existen eventos salientes para pedido, factura, catálogo o disponibilidad? |
| Webhook seguridad | ¿Cómo se firman/verifican esos eventos? |
| Webhook retries | ¿Cuántos reintentos hacen y durante cuánto tiempo? |
| Orden de eventos | ¿Garantizan orden? |
| Duplicados webhook | ¿Los eventos tienen un ID único para deduplicación? |
| Autenticación | ¿API key, OAuth, bearer token, JWT, firma HMAC, mTLS u otro mecanismo? |
| Tokens | Si hay OAuth, ¿cuánto duran access y refresh tokens? |
| Credenciales | ¿Las credenciales son por cuenta, restaurante, sucursal o caja? |
| Sandbox | ¿Existe entorno sandbox/certificación? |
| Datos sandbox | ¿Proporcionan restaurante, productos, caja y facturación ficticia? |
| Base URLs | ¿Cuáles son las URLs oficiales de sandbox y producción? |
| Idempotencia | ¿Las operaciones de creación aceptan una clave de idempotencia? |
| Referencia externa | ¿Existe un campo único `merchant_reference` o equivalente controlado por NixGoFood? |
| Timeout | Después de un timeout, ¿cómo se determina si Smartmenú recibió el pedido? |
| Duplicados | ¿Qué ocurre al repetir la misma referencia externa? |
| Errores | ¿Existe catálogo documentado de errores? |
| Retries | ¿Qué errores son reintentables? |
| Límites | ¿Cuál es el rate limit por cliente/restaurante/IP? |
| Paginación | ¿Cómo se paginan catálogo y pedidos? |
| Incremental | ¿Existe `updated_since`, cursor, versión o equivalente para sincronización incremental? |
| Webhooks catálogo | ¿Puede notificarse cambio de precio, stock o producto? |
| Versionamiento | ¿Cómo versionan la API y cuánto tiempo mantienen versiones antiguas? |
| SLA | ¿Existe SLA de disponibilidad para integraciones? |
| IP | ¿Requieren allowlist de IPs? |
| Certificados | ¿Requieren certificados cliente o algún archivo criptográfico? |
| Convenio | ¿La API requiere convenio comercial/partner? |
| Costos | ¿Existe costo de habilitación, mensualidad, por transacción o por sucursal? |
| Soporte | ¿Existe canal técnico de escalamiento para partners? |
| Certificación | ¿SmartCorp debe certificar la integración antes de producción? |

### Credenciales y ambiente que deberíamos pedir

La solicitud de sandbox debería pedir expresamente:

- cuenta técnica NixGoFood;
- comercio/restaurante de prueba;
- una o más sucursales de prueba;
- identificadores de caja;
- establecimiento y punto de emisión ficticios cuando el sandbox contemple facturación;
- catálogo que incluya producto simple, producto con extras, variante y combo;
- productos activos y agotados;
- distintos impuestos/configuraciones admitidos por Smartmenú;
- credenciales no productivas;
- documentación del mecanismo de autenticación;
- endpoints/base URL **proporcionados por SmartCorp**, no deducidos;
- ejemplos oficiales de request/response;
- ejemplos de errores;
- mecanismo para simular timeout o fallo;
- webhook de prueba, si existe;
- claves/secretos de firma del webhook, si corresponde;
- límites de frecuencia;
- procedimiento para resetear datos;
- contactos de soporte de integración.

### Solicitud formal propuesta

La ficha oficial de Google Play de Smartmenu POS publica `desarrollo@smartmenuec.com` como correo de soporte técnico del producto y vincula al desarrollador Smartcorpec S.A.S. citeturn30view2

**Asunto:** Solicitud de documentación API e integración NixGoFood ↔ Smartmenú

> Estimado equipo de SmartCorp / Smartmenú:
>
> Somos el equipo de NixGoFood, plataforma SaaS para e-commerce y pedidos digitales de restaurantes.
>
> Estamos evaluando una integración en la que NixGoFood funcione como canal digital de ventas y Smartmenú continúe siendo el sistema POS, operacional, de comandas, inventario y facturación electrónica del restaurante.
>
> El flujo que deseamos validar es:
>
> **Cliente → NixGoFood → Smartmenú → POS/comandas → facturación electrónica**
>
> Antes de realizar cualquier implementación queremos hacerlo exclusivamente sobre interfaces oficialmente soportadas por SmartCorp.
>
> Agradeceríamos confirmar, en primer lugar, si Smartmenú dispone de una API mediante la cual sistemas externos puedan crear pedidos y/o ventas dentro de Smartmenú. Hemos encontrado información pública sobre la capacidad de Smartmenu Kiosko para integrarse con APIs de otros sistemas POS, pero necesitamos confirmar específicamente la dirección inversa: **sistema externo → Smartmenú**.
>
> En caso afirmativo, solicitamos por favor:
>
> documentación técnica vigente; especificación OpenAPI/Swagger o colección Postman si existe; mecanismo de autenticación; acceso a sandbox/certificación; credenciales de pruebas; documentación de catálogo, sucursales, cajas, pedidos, pagos, estados, inventario/disponibilidad y facturación; política de idempotencia y tratamiento de duplicados; códigos de error y rate limits; documentación de webhooks; procedimiento para obtener número de factura, clave de acceso SRI, XML y RIDE si dichas funciones están disponibles; requisitos comerciales, costos y procedimiento de certificación para partners.
>
> También necesitamos confirmar si un pedido creado por integración puede generar las comandas operativas y, posteriormente, la factura electrónica dentro de Smartmenú sin que NixGoFood tenga que emitir un segundo comprobante.
>
> Nuestra prioridad es preservar a Smartmenú como sistema operacional y fiscal del restaurante, evitando duplicación de pedidos, ventas o documentos tributarios.
>
> Quedamos atentos a coordinar una reunión técnica con el equipo de desarrollo/integraciones.
>
> Saludos,  
> **Equipo NixGoFood**

## Arquitectura propuesta para NixGoFood y modelo de datos

La falta de documentación Smartmenú no impide diseñar correctamente el límite de integración. De hecho, es mejor diseñarlo antes de conocer los detalles del proveedor, porque evita que la estructura interna de Smartmenú termine contaminando toda la aplicación.

### Arquitectura recomendada

No utilizaría una única interfaz enorme en la que todos los proveedores “supuestamente” implementan todas las funciones.

Preferiría una arquitectura por **capabilities/ports**, porque Smartmenú, Contífico, Datil u otros proveedores probablemente ofrecerán capacidades diferentes.

```text
                         NixGoFood
                            │
                 ┌──────────┴──────────┐
                 │                     │
              Checkout              Admin
                 │                     │
                 └──────────┬──────────┘
                            ▼
                POSIntegrationService
                            │
                  Provider Registry
                            │
          ┌─────────────────┼─────────────────┐
          │                 │                 │
          ▼                 ▼                 ▼
  SmartmenuAdapter   ContificoAdapter    DatilAdapter
     [stub hoy]           [...]             [...]
          │
          ▼
  Provider capabilities
  ├── ConnectionPort
  ├── BranchPort
  ├── CatalogPort
  ├── AvailabilityPort
  ├── OrderPort
  ├── InvoicePort
  └── WebhookPort
```

El futuro `NixGoSriAdapter` debería pertenecer al mismo dominio de integración fiscal, pero **no activarse simultáneamente con Smartmenú como emisor fiscal para una misma venta**.

Conceptualmente:

```text
ProviderCapabilities
  catalog.read
  catalog.modifiers
  availability.read
  orders.create
  orders.read
  orders.cancel
  payments.report
  invoices.read
  invoices.xml
  invoices.ride
  webhooks.orders
  webhooks.catalog
  webhooks.invoice
```

Esto elimina un problema de la interfaz original:

```text
getProducts()
getModifiers()
createOrder()
getInvoice()
```

Si un proveedor no soporta `getModifiers()`, no conviene fingir que lo soporta y devolver arreglos vacíos. Debe declararse explícitamente que la capability no existe.

### Contrato interno recomendado

El núcleo debería trabajar con DTOs canónicos de NixGoFood, no con JSON de cada proveedor:

```text
CanonicalBranch
CanonicalProduct
CanonicalModifierGroup
CanonicalModifierOption
CanonicalAvailability
CanonicalCustomer
CanonicalOrder
CanonicalOrderItem
CanonicalPayment
CanonicalInvoice
```

El adaptador es responsable de:

```text
NixGo canonical DTO
        │
        ▼
Provider-specific representation
        │
        ▼
Proveedor
```

y a la inversa:

```text
Proveedor
    │
    ▼
Raw provider response
    │
    ▼
Canonical NixGo result
```

Ningún componente de `orders`, checkout, KDS o frontend debería saber:

- cómo autentica Smartmenú;
- qué nombres utiliza Smartmenú;
- qué códigos de estado utiliza;
- qué endpoint utiliza;
- qué formato tiene su factura.

Esos detalles deben existir únicamente en el adaptador.

### Fuente maestra del catálogo

Para restaurantes que **ya trabajan con Smartmenú**, recomiendo una variante de la opción A:

**Smartmenú = maestro operacional/fiscal**  
**NixGoFood = maestro de presentación del canal digital**

No recomiendo una sincronización bidireccional indiscriminada.

La autoridad debería dividirse aproximadamente así:

| Dato | Autoridad recomendada |
|---|---|
| ID Smartmenú | Smartmenú |
| SKU/código operativo | Smartmenú |
| Producto activo en POS | Smartmenú |
| Precio base | Smartmenú |
| Configuración tributaria | Smartmenú |
| Modificadores operativos | Smartmenú |
| Opciones/extras | Smartmenú |
| Estructura de combo | Smartmenú |
| Inventario | Smartmenú |
| Disponible/agotado | Smartmenú, si la API lo permite |
| Nombre comercial web | NixGoFood puede mantener overlay |
| Descripción e-commerce | NixGoFood |
| SEO | NixGoFood |
| Imágenes | NixGoFood, salvo que convenga importar |
| Orden visual | NixGoFood |
| Etiquetas digitales | NixGoFood |
| Visibilidad por canal | NixGoFood |
| Promociones fiscales/POS | Smartmenú |
| Campañas exclusivas del canal | NixGoFood, únicamente si Smartmenú puede representar correctamente el precio/descuento resultante |

¿Por qué?

Porque un restaurante que ya opera en Smartmenú probablemente depende de sus productos para caja, inventario por receta y facturación; SmartCorp confirma públicamente que esas funciones viven en el mismo ecosistema. citeturn30view6

Hacer que NixGoFood reemplace esa autoridad implicaría el riesgo de que el canal digital venda:

```text
Producto NixGoFood
precio $9.50
IVA/configuración A
modificador X

≠

Producto Smartmenú
precio $10.00
configuración fiscal B
modificador Y
```

y el problema aparecería únicamente cuando el pedido llegue a caja, cocina o factura.

Por ello mi recomendación no es A “puro”, sino:

> **Smartmenú controla la semántica operacional y fiscal; NixGoFood mantiene una capa de enriquecimiento de e-commerce.**

Esta estrategia queda condicionada a que SmartCorp efectivamente permita leer el catálogo. Si no existe API de catálogo, la alternativa segura será **mapeo manual explícito**, no scraping ni ingeniería inversa.

### Modelo conceptual de integración

No aprobaría aún una migración SQL, pero conceptualmente separaría estas responsabilidades.

**`integration_connections`**

Una fila por combinación restaurante/proveedor.

```text
id
tenant_id
provider
display_name
status
environment
credential_secret_ref
config
capabilities
last_health_check_at
last_health_status
created_at
updated_at
```

No contiene la API key directamente.

Ejemplo conceptual:

```text
Restaurante A → connection Smartmenu A
Restaurante B → connection Contifico B
Restaurante C → ninguna connection
```

**`integration_branch_mappings`**

Aunque un `integration_entity_mapping` genérico podría mapear sucursales, la sucursal es tan fundamental para routing que merece una relación explícita.

```text
connection_id
tenant_id
nixgo_branch_id
external_branch_id
external_location_metadata
active
```

**`integration_entity_mappings`**

Para entidades de catálogo y otros objetos.

```text
id
tenant_id
connection_id
entity_type
nixgo_entity_id
external_id
external_parent_id
external_metadata
sync_version
last_synced_at
created_at
updated_at
```

Restricciones conceptuales indispensables:

```text
UNIQUE(connection_id, entity_type, nixgo_entity_id)

UNIQUE(connection_id, entity_type, external_id)
```

La segunda podría necesitar una variante dependiendo de si el proveedor reutiliza IDs entre sucursales; eso debe comprobarse con SmartCorp.

**`integration_order_links`**

No confiaría solamente en la tabla genérica para pedidos. Los pedidos necesitan datos operativos propios:

```text
tenant_id
connection_id
order_id
external_order_id
external_sale_id
external_reference
submission_state
provider_status_raw
normalized_status
last_provider_sync_at
invoice_state
created_at
updated_at
```

**`integration_invoice_links`**

```text
tenant_id
connection_id
order_id
external_invoice_id
establishment
emission_point
sequence
invoice_number
sri_access_key
authorization_status
xml_object_ref
ride_object_ref
issued_at
last_checked_at
```

Solo se almacenarían campos que el proveedor realmente entregue.

**`integration_jobs`**

Sí recomiendo conservar esta abstracción, aunque utilicemos una cola real por debajo.

```text
id
tenant_id
branch_id
connection_id
entity_type
entity_id
operation
idempotency_key
status
attempt
max_attempts
next_attempt_at
locked_at
locked_by
request_metadata
result_metadata
last_error_code
last_error_message
created_at
started_at
completed_at
```

Estados recomendados:

```text
pending
processing
succeeded
retry_scheduled
unknown_outcome
failed
manual_review
cancelled
```

Añadiría **`unknown_outcome`**, que es crítico en POS.

Un timeout no siempre significa “falló”. Puede significar:

```text
NixGoFood ───── createOrder ─────► Smartmenú
                                 pedido creado
                 X
           respuesta perdida
```

Si tratamos eso automáticamente como `failed` y volvemos a crear, podemos producir dos pedidos.

**`integration_webhook_events`**

Solo se utilizará si el proveedor soporta webhooks.

```text
provider
connection_id
tenant_id
provider_event_id
event_type
received_at
signature_valid
processing_status
payload_hash
processed_at
error
```

Con:

```text
UNIQUE(connection_id, provider_event_id)
```

cuando el proveedor garantice un identificador estable.

**`provider_status_mappings`**

```text
provider
entity_type
provider_status
normalized_status
terminal
updated_at
```

No se debe escribir:

```typescript
if (smartmenu.status === "XYZ") ...
```

por toda la aplicación.

### Cola recomendada

Dado el stack actual, Supabase ya ofrece **Queues**, basada en `pgmq`, para mensajería durable en PostgreSQL, además de RLS/controles de autorización. Supabase también soporta Cron y Edge Functions para ejecución de procesos asíncronos. citeturn25search3turn26search2turn26search6

Recomendaría:

```text
orders / integration_jobs
      │
      │ misma unidad transaccional
      ▼
Supabase Queue
      │
      ▼
Integration Worker
      │
      ▼
POSIntegrationService
      │
      ▼
Provider Adapter
```

Pero mantendría `integration_jobs` igualmente.

La cola responde a:

> “¿qué trabajo debe ejecutarse?”

`integration_jobs` responde a:

> “¿qué ocurrió con esta operación de negocio?”

Supabase documenta que sus queues son durables y que los mensajes pueden mantenerse dentro del ecosistema PostgreSQL. citeturn25search3

Una advertencia importante: aunque la cola ofrezca garantías de entrega, **eso no convierte automáticamente una llamada HTTP a un POS externo en exactly-once**. La unicidad del efecto remoto depende de la capacidad de idempotencia/reconciliación del proveedor.

## Flujos de pedido, sincronización, inventario y factura

### Flujo completo de pedido

La operación que recomiendo es:

```text
Cliente
  │
  ▼
NixGoFood Checkout
  │
  ├─ validar tenant/sucursal
  ├─ validar catálogo
  ├─ recalcular precio en servidor
  ├─ congelar snapshot del pedido
  └─ validar pago
  │
  ▼
Transacción PostgreSQL
  │
  ├─ crear order
  ├─ crear order_items
  ├─ crear payment snapshot
  ├─ asignar client_order_key UNIQUE
  └─ crear integration_job
  │
  ▼
COMMIT
  │
  ▼
Queue
  │
  ▼
Integration Worker
  │
  ▼
POSIntegrationService
  │
  ▼
SmartmenuAdapter
  │
  ├─ NO implementado actualmente
  │
  └─ cuando exista contrato oficial
          │
          ▼
       Smartmenú
          │
          ├─ pedido
          ├─ comanda ?
          ├─ inventario ?
          └─ venta/factura ?
```

Los signos `?` son deliberados: esas consecuencias de un pedido recibido desde API **REQUIEREN CONFIRMACIÓN DE SMARTCORP**.

### Estrategia de idempotencia

Necesitamos dos niveles.

**Idempotencia local**

El checkout debe generar una identidad de orden estable, no una nueva identidad por cada clic.

Ejemplo conceptual:

```text
client_order_key
tenant_id + checkout_session_id
```

La base debe impedir:

```text
mismo tenant + mismo checkout_session_id
```

dos veces.

Esto resuelve:

- doble clic;
- reenvío del navegador;
- retry de frontend;
- mala conexión entre navegador y NixGoFood.

**Idempotencia hacia el proveedor**

Debe generarse una referencia determinística e inmutable, por ejemplo conceptualmente:

```text
nixgo:<tenant>:<order_uuid>:create-order:v1
```

Pero **no podemos asumir que Smartmenú acepte una idempotency key**.

Por eso tenemos dos escenarios.

**Cuando SmartCorp confirme idempotencia:**

```text
try 1 ──timeout──► retry con MISMA clave
                      │
                      ▼
                 mismo pedido
```

**Cuando SmartCorp NO tenga idempotencia:**

después de un timeout no deberíamos volver a ejecutar `createOrder()` automáticamente hasta disponer de un mecanismo confiable de reconciliación:

```text
createOrder()
     │
   timeout
     │
     ▼
unknown_outcome
     │
     ├─ buscar por external_reference, si proveedor lo permite
     │
     ├─ determinar si ya existe
     │
     └─ solo entonces reintentar
```

Si Smartmenú no tiene:

- idempotency key;
- búsqueda por referencia externa;
- ni otra garantía de deduplicación,

el sistema debe pasar casos ambiguos a `manual_review`.

Eso es preferible a producir comandas o facturas duplicadas.

### Reintentos

Propongo **exponential backoff con jitter**, por ejemplo como política interna:

```text
base delay = 5 s
delay máximo = 15 min

delay ≈ random(0, min(max_delay, base × 2^attempt))
```

Los valores deberían ser configurables.

Clasificación conceptual:

| Resultado | Acción |
|---|---|
| Error de validación de producto | No retry automático |
| Credenciales inválidas | Suspender integración / alertar |
| Producto inexistente | `manual_review` |
| Precio incompatible | `manual_review` o rechazo según política |
| Timeout antes de saber resultado | `unknown_outcome` |
| Rate limit | Retry según contrato/`Retry-After` si existe |
| Error temporal servidor | Retry |
| Sucursal inválida | No retry |
| Pedido ya existente | Reconciliar; tratar como éxito solo si se comprueba que corresponde |
| Red caída | Retry seguro únicamente con idempotencia/reconciliación |

No asignaría códigos HTTP concretos a Smartmenú hasta disponer de documentación.

### Control de discrepancias de precio

La regla debe ser explícita por proveedor/restaurante:

```text
STRICT_PROVIDER_PRICE
CHANNEL_PRICE_ALLOWED
MANUAL_REVIEW_ON_MISMATCH
```

Para Smartmenú recomendaría inicialmente:

**`MANUAL_REVIEW_ON_MISMATCH` o `STRICT_PROVIDER_PRICE`**, hasta conocer su contrato.

NixGoFood debe guardar siempre un snapshot inmutable del momento de compra:

```text
unit_price
modifier_price
discount
tax
delivery
tip
line_total
order_total
catalog_version / synchronized_at
```

Nunca reconstruir una orden histórica usando el precio actual del producto.

### Sincronización de catálogo

Prioridad propuesta:

```text
Webhook
   │ si no existe
   ▼
Polling incremental
   │ si no existe
   ▼
Sync manual
```

**Webhooks Smartmenú: NO CONFIRMADO.**

**Polling incremental Smartmenú: NO CONFIRMADO.**

Por ello el mecanismo concreto queda pendiente.

Para prevenir loops, cada modificación sincronizada debería incluir internamente:

```text
source = nixgo | provider | admin
origin_event_id
sync_version
last_synced_hash
```

y definirse una autoridad por campo.

Ejemplo:

```text
Smartmenú cambia price
         │
         ▼
NixGoFood actualiza price

NO:

NixGoFood recibe price
       │
       ▼
guarda
       │
       ▼
detecta "cambio local"
       │
       ▼
manda price nuevamente a Smartmenú
       │
       └──── loop
```

El modelo híbrido de autoridad elimina gran parte de este problema.

### Inventario

SmartCorp confirma que Smartmenú dispone de **inventario por receta** en sus planes. citeturn30view6

Pero para NixGoFood no recomiendo importar recetas ni replicar el ledger completo.

La representación mínima correcta sería:

```text
product_id
branch_id
is_available
available_qty      nullable
availability_source
observed_at
expires_at
```

La lógica del restaurante puede permanecer:

```text
Smartmenú
  pollo = 3 kg
  arroz = 4 kg
  salsa = ...
  receta = ...
       │
       ▼
 disponibilidad de plato
       │
       ▼
NixGoFood
 available = true/false
```

No necesitamos reproducir:

- kardex;
- compras;
- proveedores;
- recetas;
- lotes;
- costos.

Eso reduciría enormemente el acoplamiento.

`available_qty` debe ser opcional porque **NO ESTÁ CONFIRMADO** que Smartmenú exponga cantidad utilizable a terceros.

### Estados

Modelo interno:

```text
pending
accepted
preparing
ready
out_for_delivery
delivered
cancelled
failed
```

Pero conservaría siempre:

```text
provider_status_raw
normalized_status
```

Ejemplo conceptual, no correspondiente a Smartmenú real:

```text
provider raw status
       │
       ▼
provider_status_mappings
       │
       ▼
normalized NixGoFood status
```

Los estados reales de Smartmenú son **REQUIERE INFORMACIÓN DE SMARTCORP**.

Nunca debemos inventarlos.

Un estado desconocido recibido después de una actualización del proveedor debe:

```text
guardarse raw
no descartarse
generar alerta
mapearse provisionalmente a unknown
```

en lugar de interpretarlo arbitrariamente.

### Facturación y SRI

La arquitectura fiscal debe tener un principio:

> **Una venta, un único sistema responsable de emitir su comprobante fiscal.**

Para clientes Smartmenú:

```text
fiscal_owner = SMARTMENU
```

Flujo deseado:

```text
NixGoFood order
      │
      ▼
Smartmenú order/sale
      │
      ▼
Smartmenú facturación electrónica
      │
      ▼
SRI
      │
      ▼
Smartmenú recibe resultado
      │
      ▼
NixGoFood obtiene metadata
   [solo si API lo permite]
```

No:

```text
                     ┌──► Smartmenú ──► factura A
Pedido NixGoFood ────┤
                     └──► NixGoSri ───► factura B
```

El SRI publica actualmente el esquema Off-line versión 2.34, actualizado en julio de 2026. El ambiente de pruebas permite validar la integración sin validez tributaria, mientras que los comprobantes autorizados en producción sí tienen validez tributaria. citeturn31view0turn31view1

La estructura fiscal ecuatoriana contempla, entre otros elementos, establecimiento, punto de emisión, secuencial y clave de acceso. La ficha técnica oficial muestra que la clave de acceso tiene 49 dígitos. citeturn29view2turn16view0

También contempla información del comprador como tipo de identificación, razón social/nombre e identificación, además de detalles de productos, cantidad, precio unitario, descuentos e impuestos. citeturn29view2turn28view0turn28view4

La documentación vigente contempla además propina, importe total y formas de pago codificadas. citeturn29view3turn28view1turn16view2

Por tanto, el modelo canónico de NixGoFood debería ser capaz de representar al menos:

```text
customer
  identification_type
  identification_number
  legal_name
  email
  phone
  address

order
  items
  quantities
  prices
  discounts
  taxes
  delivery_charge
  tip
  totals

payment
  method
  amount
  external_transaction_reference
```

Pero hay que distinguir dos cosas:

**CONFIRMADO POR DOCUMENTACIÓN SRI:** existen campos fiscales como identificación del comprador, precios, descuentos, impuestos, propina, total, establecimiento/punto de emisión/secuencial y forma de pago. citeturn29view2turn29view3

**REQUIERE INFORMACIÓN DE SMARTCORP:** qué subconjunto de esos datos recibe su API, qué códigos utiliza y qué datos calcula internamente Smartmenú.

No debemos diseñar el payload Smartmenú copiando simplemente el XML del SRI.

Sobre XML/RIDE: el SRI confirma que su ecosistema de facturación trabaja con comprobantes XML y que el RIDE es la representación impresa del documento electrónico. citeturn31view1turn31view2

Pero:

**que Smartmenú pueda devolver XML/RIDE vía API sigue NO CONFIRMADO.**

### Protección frente a doble facturación

Recomiendo agregar una política a nivel de integración:

```text
invoice_mode

provider_managed
nixgo_managed
none
```

Con una restricción de negocio:

```text
order fiscal_owner = provider
        =>
NixGoSriAdapter.issueInvoice(order) prohibited
```

Además, la ambigüedad de red después de una operación que pueda disparar facturación debe tratarse con aún más cuidado que un pedido normal:

```text
"timeout" ≠ "factura no creada"
```

Sin idempotencia o consulta por referencia no debe generarse automáticamente una segunda venta fiscal.

## Seguridad, multi-tenant, observabilidad y riesgos

### Aislamiento multi-tenant

La integración debe modelarse alrededor de `tenant_id + connection_id`, nunca simplemente alrededor de `provider`.

```text
Tenant A
  └─ Smartmenu connection A
        └─ secret A

Tenant B
  └─ Contifico connection B
        └─ secret B

Tenant C
  └─ no integration
```

Toda entidad de integración debe estar asociada explícitamente al tenant.

Como NixGoFood utiliza Supabase/PostgreSQL, RLS es apropiado para impedir acceso transversal entre restaurantes. Supabase recomienda habilitar RLS y limitar grants en las tablas expuestas; su documentación también advierte que las claves secretas/service-role pueden saltarse RLS y nunca deben llegar al navegador. citeturn25search1turn25search0

Una política conceptual debe comprobar:

```text
authenticated user
        │
        ▼
membership / role
        │
        ▼
tenant_id == permitted tenant
```

Y se deben añadir pruebas negativas:

```text
usuario restaurante A
   SELECT tenant B   → DENIED
   UPDATE tenant B   → DENIED
   INSERT tenant B   → DENIED
   DELETE tenant B   → DENIED
```

Supabase recomienda precisamente probar permisos de RLS para operaciones permitidas y denegadas. citeturn25search1

### Gestión de secretos

La separación recomendada es:

**Secretos globales del proveedor**, si SmartCorp entrega un `client_secret` común a toda NixGoFood:

```text
Edge Function / backend environment secrets
```

Supabase proporciona secretos/variables de entorno para Edge Functions y advierte que sus claves secretas no deben utilizarse en browser. citeturn25search0

**Credenciales específicas por restaurante:**

```text
integration_connections
  credential_secret_ref = UUID
                   │
                   ▼
            encrypted secret store
```

Supabase Vault permite guardar secretos cifrados en PostgreSQL y recuperar un identificador de secreto; su propia documentación advierte que el acceso a la vista descifrada debe protegerse cuidadosamente. citeturn25search2

Por tanto:

```text
integration_connections
  ✅ provider
  ✅ tenant
  ✅ environment
  ✅ secret_reference

  ❌ api_key
  ❌ password
  ❌ refresh_token
  ❌ certificate
```

Los secretos no deben aparecer en:

```text
React bundle
Vite env pública
localStorage
sessionStorage
Redux/Zustand state
network responses al navegador
logs
Sentry breadcrumbs
integration_jobs.payload
audit_events
```

### Certificados

Para el flujo Smartmenú→SRI, el ideal es que la infraestructura fiscal siga residiendo en Smartmenú.

El SRI requiere firma electrónica para que el comprobante electrónico tenga validez, y publica los requisitos de emisión electrónica. citeturn30view7

Pero **no encontré evidencia pública sobre cómo Smartmenú custodia esos certificados**, por lo que cualquier afirmación al respecto sería inventada.

Si en el futuro se implementa `NixGoSriAdapter`, sus certificados deberían tratarse como secretos de alto valor:

```text
encrypted secret manager
server-side only
strict access control
rotation
audited reads
never downloadable by tenant frontend
```

### Datos personales

La integración procesará nombre, identificación, correo, teléfono y dirección. Smartmenú reconoce públicamente el tratamiento de información de identificación/contacto en sus servicios y para procesos de factura. citeturn0search3

La Ley Orgánica de Protección de Datos Personales de Ecuador exige medidas de seguridad adecuadas y necesarias y la protección de datos desde diseño; la autoridad ecuatoriana también recuerda las obligaciones contractuales cuando un encargado trata datos por cuenta de un responsable. citeturn27search0turn27search1

Por ello, además de API y seguridad técnica, el convenio con SmartCorp debería clarificar:

```text
quién es responsable
quién es encargado
finalidad
datos intercambiados
retención
eliminación
subencargados
incidentes
medidas de seguridad
```

La calificación jurídica exacta de cada parte debe revisarse contractualmente; no debe inferirse solo a partir de la arquitectura.

### Observabilidad

El panel:

**Configuración → Integraciones → Smartmenú**

debería alimentarse exclusivamente de datos internos normalizados:

| Elemento UI | Fuente interna |
|---|---|
| Conectado/desconectado | `integration_connections.last_health_status` |
| Sucursal | `integration_branch_mappings` |
| Última sincronización | `integration_sync_state` |
| Pedidos enviados hoy | `integration_jobs` / `integration_order_links` |
| Pedidos con error | jobs `failed/manual_review` |
| Productos sincronizados | `integration_entity_mappings` |
| Último error | último job/evento fallido |
| Probar conexión | backend → adapter `healthCheck` |
| Sincronizar productos | crear job |
| Reintentar errores | crear/reprogramar job autorizado |
| Ver logs | `integration_audit_events` |

El frontend **no debe ejecutar directamente llamadas Smartmenú**.

### Auditoría

Recomiendo un evento append-only:

```text
integration_audit_events

id
tenant_id
connection_id
provider
actor_type
actor_user_id
operation
entity_type
entity_id
request_id
external_id
result
error_code
occurred_at
metadata_redacted
```

Debe responder preguntas como:

```text
¿quién reintentó el pedido?
¿cuándo se sincronizó?
¿qué connection se utilizó?
¿qué request ID devolvió el proveedor?
¿se creó external_order_id?
¿qué error ocurrió?
```

No debe responder mediante guardar indiscriminadamente toda la petición con PII.

Datos prohibidos en auditoría:

```text
Authorization headers
API keys
access tokens
refresh tokens
passwords
private keys
certificates
webhook secrets
full card data
```

### Riesgos

| Nivel | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| **Crítico** | API inbound Smartmenú no confirmada | Puede invalidar el flujo central NixGoFood→Smartmenú | Obtener confirmación técnica antes de implementar |
| **Crítico** | Pedido duplicado por timeout/retry | Doble preparación, doble cobro o doble venta | Idempotencia + `unknown_outcome` + reconciliación |
| **Crítico** | Doble factura NixGoFood + Smartmenú | Duplicación fiscal | `fiscal_owner` único |
| **Alto** | Smartmenú no ofrece idempotencia ni lookup por referencia | Retry seguro imposible en fallos ambiguos | Manual review / exigir mecanismo al proveedor |
| **Alto** | Filtración de credenciales entre tenants | Compromiso de restaurantes | Secret store + server-only + RLS |
| **Alto** | Mapeo incorrecto producto/modificador | Cocina/factura equivocada | IDs externos estables + validación |
| **Alto** | Precio diferente entre ambos sistemas | Rechazos, diferencias contables | Autoridad de precio + snapshot |
| **Alto** | Sucursal/caja/punto de emisión incorrectos | Operación/factura en establecimiento erróneo | Mapping explícito y validado |
| **Alto** | Reintentar una venta que ya facturó | Segundo documento/transacción | Reconciliación antes de retry |
| **Medio** | Stock desactualizado por polling | Venta de producto agotado | TTL + frecuencia razonable + webhook si existe |
| **Medio** | Nuevos estados Smartmenú desconocidos | Estado incorrecto en NixGoFood | Raw status + tabla mapping + alerta |
| **Medio** | Webhook duplicado/reordenado | Transiciones incoherentes | event ID, timestamp/version, dedupe |
| **Medio** | Rate limits desconocidos | Bloqueo temporal | preguntar límites + backoff |
| **Medio** | API cambia sin aviso | Integración rota | versionamiento + contract tests |
| **Medio** | Exceso de PII en logs | Riesgo LOPDP | redacción y minimización citeturn27search0turn27search1 |
| **Bajo** | Imagen/categoría visual diferente | Experiencia digital inconsistente | Overlay NixGoFood |
| **Bajo** | Sincronización manual olvidada | Catálogo no actualizado | indicador de antigüedad + alertas |

## Roadmap y condición para implementar Smartmenú

El roadmap debe estar gobernado por **criterios de salida**, no por presión por completar fases.

| Fase | Trabajo | Criterio para avanzar |
|---|---|---|
| **Fase 0 — investigación** | Evidencia pública, arquitectura, preguntas a SmartCorp, análisis real del repo NixGoFood | SmartCorp responde dirección de integración y se obtiene acceso al código |
| **Fase 1 — sandbox** | Recibir docs, credenciales, ambiente de prueba, datos sample; construir contract tests | Crear/consultar operación mínima de forma documentada |
| **Fase 2 — catálogo** | Implementar categorías, productos, modificadores, combos, mapping, disponibilidad | Sincronización determinística y pruebas de cambios |
| **Fase 3 — pedidos** | Crear pedidos, idempotencia, queue worker, retries, reconciliation | Pruebas de doble clic, timeout y duplicados aprobadas |
| **Fase 4 — estados** | Polling/webhooks, `provider_status_mapping`, cancelación si existe | Estados y eventos documentados y probados |
| **Fase 5 — facturación** | Datos fiscales, cierre/venta, metadata SRI, factura/XML/RIDE si existen | Confirmación de no duplicidad y pruebas sandbox fiscal |
| **Fase 6 — producción** | Piloto con restaurante, monitoreo, alertas, runbooks | Operación estable, rollback y soporte SmartCorp definidos |

### Trabajo permitido ahora

Hasta que SmartCorp entregue uno de los artefactos exigidos, sí aprobaría construir:

```text
POSIntegrationService
Provider Registry
ProviderCapabilities
DTOs canónicos
interfaces/ports
SmartmenuAdapterStub
SmartmenuMockProvider
GenericRestAdapter
integration_jobs
integration audit model
status mappings
idempotency local
queue abstraction
retry policies
admin integration UI
unit tests
failure simulations
RLS tests
documentation
```

El `SmartmenuAdapterStub` debería responder algo equivalente internamente a:

```text
provider = smartmenu
status = not_configured / documentation_required
```

y **no contener ninguna URL o endpoint imaginado**.

### Trabajo que debe permanecer bloqueado

No aprobaría todavía:

```text
SmartmenuAdapter.createOrder() real
SmartmenuAdapter.getProducts() real
SmartmenuAdapter.getInvoice() real
OAuth/API-key implementation
webhook endpoint Smartmenu-specific
payload serializers Smartmenu-specific
branch/cash identifiers
Smartmenu status constants
Smartmenu retry semantics
Smartmenu invoice trigger
```

Todos esos elementos son actualmente **REQUIERE INFORMACIÓN DE SMARTCORP**.

### Qué debe ocurrir al recibir la documentación

Cuando SmartCorp proporcione Swagger, OpenAPI, Postman, PDF, correo técnico o sandbox, la primera tarea no debe ser programar.

Debe crearse una matriz de contraste:

| Investigación actual | Documento SmartCorp | Resultado |
|---|---|---|
| API inbound no confirmada | ¿Existe? | confirmar/contradecir |
| Catálogo read no confirmado | operaciones oficiales | actualizar capabilities |
| Stock no confirmado | schema real | decidir disponibilidad |
| Idempotencia desconocida | contrato real | diseñar retry definitivo |
| Webhooks desconocidos | eventos reales | elegir webhook/polling |
| Facturación externa desconocida | flujo real | validar `fiscal_owner` |
| XML/RIDE desconocidos | operaciones reales | implementar o descartar |
| Branch/cash IDs desconocidos | modelo real | cerrar mapping |
| Estados desconocidos | enum real | poblar status mapping |

Solo entonces implementaría el adaptador y exigiría estas pruebas antes del piloto:

```text
credenciales válidas
credenciales inválidas
pedido normal
pedido con modificadores
combo
producto inexistente
producto deshabilitado
precio diferente
doble clic
misma idempotency key
timeout antes de enviar
timeout después de enviar
respuesta perdida
retry
pedido duplicado
sucursal incorrecta
estado desconocido
cancelación
proveedor caído
rate limit
webhook repetido
webhook fuera de orden
factura exitosa
factura rechazada
factura pendiente
reintento después de posible facturación
```

### Gate técnico definitivo

El proyecto debe tener una regla explícita en el ADR de integración:

> **SmartmenuAdapter no pasa de stub/mock a implementación real hasta disponer de al menos una especificación oficial, ejemplos oficiales o credenciales de sandbox proporcionados por SmartCorp.**

La evidencia pública disponible al 9 de septiembre de 2026 demuestra que **Smartmenú tiene el ecosistema funcional correcto para ser el POS operacional de NixGoFood**, incluyendo productos, cajas, comandas, inventario por receta, Delivery y facturación electrónica. citeturn30view5turn30view6turn30view2turn30view3

También demuestra que **Smartmenu Kiosko está diseñado para integrarse con APIs de otros sistemas POS**, lo cual es evidencia de experiencia de SmartCorp en interoperabilidad. citeturn32search0turn33search0

Pero **no demuestra la capacidad que NixGoFood necesita: crear pedidos/ventas desde un tercero hacia Smartmenú**.

Por eso, la conclusión rigurosa es:

**NixGoFood + Smartmenú es arquitectónicamente prometedor y funcionalmente compatible, pero la integración directa permanece condicionada a que SmartCorp confirme y documente una interfaz inbound soportada. Hasta entonces, la viabilidad es MEDIA y no debe escribirse tráfico real contra Smartmenú.**

La arquitectura recomendada permite que, incluso si SmartCorp finalmente responde que esa API no existe, el trabajo no se pierda: el mismo `POSIntegrationService`, cola, idempotencia, seguridad, mappings, observabilidad y contratos canónicos podrán utilizarse con Contífico, Datil, un proveedor REST futuro o un eventual `NixGoSriAdapter`, manteniendo exactamente la filosofía buscada: **NixGoFood se adapta al sistema operacional del restaurante cuando existe una integración técnicamente soportada, en lugar de obligarlo a reemplazarlo.**