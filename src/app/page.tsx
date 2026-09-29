import type { Metadata } from 'next';
import styles from './page.module.css';
import { bricolageGrotesque, sourceSerif4, ibmPlexMono } from './fonts';
import Hero from '@/components/marketing/Hero';
import FeatureReel from '@/components/marketing/FeatureReel';

// Metadata especifica de "/": pisa la de RootLayout (src/app/layout.tsx) solo
// en esta ruta. /admin y /store tienen la suya propia, asi que esto no les
// llega.
export const metadata: Metadata = {
  title: 'NixGoFood — Pedidos directos para tu restaurante',
  description:
    'Menú digital, cocina en tiempo real, despacho con checklist y reparto. Sin comisión por pedido.',
};

const CONTACT_EMAIL = 'andresdelgado1984@gmail.com';
const CONTACT_HREF = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
  'Quiero ver NixGoFood para mi restaurante'
)}`;

const BUSINESS_404_MENU_URL = 'https://404.food.nixgodigital.com';
const LA_ESQUINA_DE_ALES_MENU_URL = 'https://burger-house.food.nixgodigital.com';
const ADMIN_URL = 'https://admin.food.nixgodigital.com/admin';

const FEATURES = [
  {
    no: '#182',
    station: 'Mostrador',
    body: (
      <>
        Menú digital mobile-first con <strong>checkout de un solo paso</strong>, mapa real de
        zonas de delivery (Leaflet + OpenStreetMap) y cálculo automático de distancia y tarifa
        por Haversine.
      </>
    ),
  },
  {
    no: '#183',
    station: 'Cocina',
    body: (
      <>
        Pantalla de cocina en tiempo real con <strong>Modo Monitor</strong> a pantalla completa.
        Los tiempos que ve el cliente se ajustan solos según la carga real de la cocina en ese
        momento.
      </>
    ),
  },
  {
    no: '#184',
    station: 'Despacho',
    body: (
      <>
        <strong>Checklist antes de salir:</strong> empaque, bebidas y extras verificados uno por
        uno, para que no salga un pedido incompleto.
      </>
    ),
  },
  {
    no: '#185',
    station: 'Reparto',
    body: (
      <>
        Asignación de motorizados y <strong>seguimiento de estado</strong> hasta la entrega o el
        retiro en local.
      </>
    ),
  },
  {
    no: '#186',
    station: 'Chat & reservas',
    body: (
      <>
        Bot conversacional que <strong>toma pedidos y reservas de mesa</strong> por chat, directo
        desde la web del restaurante.
      </>
    ),
  },
  {
    no: '#187',
    station: 'Panel',
    body: (
      <>
        <strong>Se instala como app</strong> en el celular o tablet del local: la alerta sonora de
        pedido nuevo ya no depende de un clic previo en la pantalla.
      </>
    ),
  },
  {
    no: '#188',
    station: 'Tu data',
    body: (
      <>
        Cada restaurante queda <strong>aislado del resto</strong> a nivel de base de datos: tus
        pedidos y tus clientes nunca se mezclan con otro negocio de la plataforma.
      </>
    ),
  },
];

const FLOW_STAGES = [
  { num: '01', name: 'Nuevo', desc: 'Entra al panel y suena la alerta, aunque la pantalla esté bloqueada.' },
  { num: '02', name: 'Preparando', desc: 'Aparece en la pantalla de cocina, tiempo estimado según la carga real.' },
  { num: '03', name: 'Listo', desc: 'Pasa a Despacho: checklist de empaque, bebidas y extras.' },
  { num: '04', name: 'En camino / retiro', desc: 'Motorizado asignado, o esperando que el cliente pase a retirar.' },
  { num: '05', name: 'Entregado', desc: 'Cierra el ciclo. Queda en el historial del negocio, no del agregador.' },
];

export default function MarketingHomePage() {
  return (
    <div
      className={`${styles.page} ${bricolageGrotesque.variable} ${sourceSerif4.variable} ${ibmPlexMono.variable}`}
    >
      <Hero ctaHref={CONTACT_HREF} />

      <div className={styles.wrap}>
        <section className={styles.section}>
          <div className={styles.secHead}>
            <div>
              <div className={styles.secLabel}>01 · El problema</div>
              <h2 className={styles.secTitle}>Cada pedido por agregador tiene un costo fijo: no es tuyo</h2>
            </div>
          </div>
          <div className={styles.compare}>
            <div>
              <p>
                Cuando un cliente pide por una app de delivery masiva, el pedido pasa por su
                plataforma, su comisión y su relación con el cliente — no la tuya. Si mañana
                cambian las reglas o subís un producto de precio, dependés de una decisión que no
                tomaste vos.
              </p>
              <p>
                Con un canal propio, el pedido entra directo a tu cocina, tu cliente queda en tu
                base y tu margen no se negocia con un tercero cada mes.
              </p>
            </div>
            <div className={styles.spec}>
              <div className={`${styles.specRow} ${styles.specHead}`}>
                <span>Variable</span>
                <span>Comparación</span>
              </div>
              <div className={styles.specRow}>
                <span>Comisión por pedido</span>
                <span className={styles.specAgg}>agregador: variable</span>
              </div>
              <div className={styles.specRow}>
                <span>Con NixGoFood</span>
                <span className={styles.specOwn}>tu plataforma, tu margen</span>
              </div>
              <div className={styles.specRow}>
                <span>Dueño de la relación con el cliente</span>
                <span className={styles.specAgg}>el agregador</span>
              </div>
              <div className={styles.specRow}>
                <span>Con NixGoFood</span>
                <span className={styles.specOwn}>tu restaurante</span>
              </div>
              <div className={styles.specRow}>
                <span>Datos de tus clientes</span>
                <span className={styles.specAgg}>compartidos en la plataforma</span>
              </div>
              <div className={styles.specRow}>
                <span>Con NixGoFood</span>
                <span className={styles.specOwn}>aislados, solo tuyos</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <div>
              <div className={styles.secLabel}>02 · Qué incluye</div>
              <h2 className={styles.secTitle}>Una estación de trabajo por cada parte del pedido</h2>
            </div>
          </div>
          <FeatureReel items={FEATURES} videoSrc="/media/nixgo-chef-close-loop.mp4" />
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <div>
              <div className={styles.secLabel}>03 · El recorrido de un pedido</div>
              <h2 className={styles.secTitle}>De la web del cliente a la puerta de su casa</h2>
            </div>
          </div>
          <div className={styles.flow}>
            {FLOW_STAGES.map((stage, i) => (
              <div className={styles.flowStage} key={stage.num}>
                <div className={styles.flowDotRow}>
                  <div className={styles.flowDot} />
                  {i < FLOW_STAGES.length - 1 && <div className={styles.flowLine} />}
                </div>
                <div className={styles.flowNum}>{stage.num}</div>
                <div className={styles.flowName}>{stage.name}</div>
                <div className={styles.flowDesc}>{stage.desc}</div>
              </div>
            ))}
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <div>
              <div className={styles.secLabel}>04 · Caso real</div>
              <h2 className={styles.secTitle}>El primer local que ya opera con esto todos los días</h2>
            </div>
          </div>
          <div className={styles.case}>
            <div>
              <div className={styles.caseTag}>Piloto en producción</div>
              <div className={styles.caseName}>404</div>
              <div className={styles.casePlace}>Av. Juan Íñiguez &amp; Isla Mall del Alto — Cuenca, Ecuador</div>
              <p className={styles.caseNote}>
                Hamburguesería con dos sucursales operando sobre NixGoFood: menú propio, zonas de
                delivery calculadas por distancia real desde cada sucursal, y panel de cocina
                corriendo en el mostrador durante el servicio.
              </p>
              <div className={styles.caseLinks}>
                <a
                  className={styles.caseLink}
                  href={BUSINESS_404_MENU_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver menú: 404 ↗
                </a>
                <a
                  className={styles.caseLink}
                  href={LA_ESQUINA_DE_ALES_MENU_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Ver menú: La Esquina de Ales ↗
                </a>
                <a
                  className={styles.caseLink}
                  href={ADMIN_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Entrar al panel admin ↗
                </a>
              </div>
            </div>
            <div>
              <div className={styles.menuCat}>Tacos</div>
              <div className={styles.menuItem}>
                <span>Res Birria Tradicional</span>
                <span>elige proteína</span>
              </div>
              <div className={styles.menuItem}>
                <span>Cerdo Adobado al Trompo</span>
                <span>elige proteína</span>
              </div>
              <div className={styles.menuItem}>
                <span>Pollo al Pastor</span>
                <span>elige proteína</span>
              </div>
              <div className={styles.menuCat}>Categorías del menú</div>
              <div className={styles.menuItem}>
                <span>Hamburguesas</span>
                <span>&nbsp;</span>
              </div>
              <div className={styles.menuItem}>
                <span>Combos &amp; Packs</span>
                <span>&nbsp;</span>
              </div>
              <div className={styles.menuItem}>
                <span>Entradas</span>
                <span>&nbsp;</span>
              </div>
              <div className={styles.menuItem}>
                <span>Bebidas &amp; Postres</span>
                <span>&nbsp;</span>
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.secHead}>
            <div>
              <div className={styles.secLabel}>05 · Cómo empezar</div>
              <h2 className={styles.secTitle}>Se prueba antes de operar en serio</h2>
            </div>
          </div>
          <div className={styles.modes}>
            <div className={`${styles.mode} ${styles.modeDemo}`}>
              <span className={styles.modeTag}>Modo demo</span>
              <h3>Para ver el producto</h3>
              <p>
                Corre sin base de datos propia: pedidos y menú simulados, panel de administración
                con datos reales de ejemplo. Sirve para que el dueño del restaurante recorra el
                flujo completo antes de decidir nada.
              </p>
            </div>
            <div className={`${styles.mode} ${styles.modeProd}`}>
              <span className={styles.modeTag}>Modo producción</span>
              <h3>Para operar de verdad</h3>
              <p>
                Base de datos propia con aislamiento por negocio, autenticación real y pedidos que
                llegan a la cocina en el momento. Es el mismo modo en el que ya trabaja El Taca
                Nijo.
              </p>
            </div>
          </div>
        </section>

        <section className={`${styles.section} ${styles.sectionLast}`}>
          <div className={styles.closeBlock}>
            <div className={styles.closeStat}>
              <div className={styles.closeStatValue}>$0.00</div>
              <div className={styles.closeStatLabel}>comisión por pedido, siempre</div>
            </div>
            <p className={styles.closeNote}>
              Contanos cuántas sucursales tienes y cómo operás hoy — vemos juntos si NixGoFood
              encaja, sin compromiso.
            </p>
            <a className={styles.heroCta} href={CONTACT_HREF}>
              Pedir una demo
            </a>
          </div>
        </section>

        <footer className={styles.footer}>
          <div className={styles.contact}>
            ¿Hablamos? <a href={CONTACT_HREF}>{CONTACT_EMAIL}</a>
          </div>
          <div className={styles.stamp}>
            NIXGOFOOD
            <br />
            Plataforma de pedidos directos para restaurantes
          </div>
        </footer>
      </div>
    </div>
  );
}
