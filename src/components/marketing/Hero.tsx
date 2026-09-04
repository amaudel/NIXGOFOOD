'use client';

import { useEffect, useRef, useState } from 'react';
import pageStyles from '@/app/page.module.css';
import styles from './Hero.module.css';

interface HeroProps {
  ctaHref: string;
}

// Una vuelta cada 8.5s (rango pedido: 7-10s).
const ORBIT_PERIOD_MS = 8500;
// Elipse de src/components/marketing/Hero.module.css .orbit: viewBox 0 0 800 650.
const ORBIT_CX = 460;
const ORBIT_CY = 330;
const ORBIT_RX = 260;
const ORBIT_RY = 130;

const RAIL_ITEMS = [
  { label: 'Piloto en producción:', value: 'El Taca Nijo, Cuenca' },
  { label: 'Instalable', value: 'como app en el local' },
  { label: 'Demo sin costo', value: 'antes de decidir' },
];

export default function Hero({ ctaHref }: HeroProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const ellipseRef = useRef<SVGEllipseElement>(null);
  const runnerRef = useRef<SVGCircleElement>(null);

  // Punto de partida sobre la elipse (extremo derecho, progress=0) para que
  // el marcador nunca aparezca en (0,0) antes de que corra el efecto de abajo
  // (SSR, o prefers-reduced-motion activo).
  const [runnerStart] = useState({ x: ORBIT_CX + ORBIT_RX, y: ORBIT_CY });

  // Reintento de autoplay: si el navegador bloqueo el autoplay inicial, la
  // primera interaccion real del usuario en la pagina reintenta una vez.
  useEffect(() => {
    const tryPlay = () => {
      videoRef.current?.play().catch(() => {
        // Autoplay bloqueado: se deja el primer frame visible, sin poster
        // inventado (no hay uno real disponible todavia).
      });
    };
    tryPlay();

    const retryOnce = () => {
      if (videoRef.current?.paused) tryPlay();
      window.removeEventListener('pointerdown', retryOnce);
      window.removeEventListener('keydown', retryOnce);
    };
    window.addEventListener('pointerdown', retryOnce);
    window.addEventListener('keydown', retryOnce);
    return () => {
      window.removeEventListener('pointerdown', retryOnce);
      window.removeEventListener('keydown', retryOnce);
    };
  }, []);

  // Punto naranja que recorre la elipse. rAF con cache de la longitud total
  // (no se recalcula por frame) y pausa real cuando la pestaña no es visible.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const ellipse = ellipseRef.current;
    const marker = runnerRef.current;
    if (!ellipse || !marker) return;

    const length = ellipse.getTotalLength();
    let rafId = 0;
    let start: number | null = null;

    const step = (ts: number) => {
      if (start === null) start = ts;
      const progress = ((ts - start) % ORBIT_PERIOD_MS) / ORBIT_PERIOD_MS;
      const point = ellipse.getPointAtLength(progress * length);
      marker.setAttribute('cx', String(point.x));
      marker.setAttribute('cy', String(point.y));
      rafId = requestAnimationFrame(step);
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        start = null;
        rafId = requestAnimationFrame(step);
      }
    };

    rafId = requestAnimationFrame(step);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      cancelAnimationFrame(rafId);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  return (
    <section className={styles.hero} aria-label="NixGoFood: pedidos directos para restaurantes">
      <div className={styles.inner}>
        <div className={styles.copy}>
          <div className={`${styles.eyebrow} ${styles.animate}`}>
            Plataforma de pedidos directos para restaurantes
          </div>
          <h1 className={`${styles.h1} ${styles.animate}`}>
            Tu restaurante ya no necesita{' '}
            <span className={styles.highlight}>pagarle comisión</span> a nadie por vender online.
          </h1>
          <p className={`${styles.sub} ${styles.animate}`}>
            NixGoFood es tu propia plataforma de pedidos directos: mostrador móvil, cocina en
            tiempo real, despacho con checklist y reparto — todo con tus clientes, tus datos y tus
            precios, sin intermediario quedándose con un porcentaje de cada venta.
          </p>
          <div className={`${styles.rail} ${styles.animate}`}>
            {RAIL_ITEMS.map((item, i) => (
              <span key={item.label}>
                {i > 0 && <span className={styles.railDivider} aria-hidden="true" />}
                {'  '}
                <b>{item.label}</b> {item.value}
              </span>
            ))}
          </div>
          <div className={`${styles.cta} ${styles.animate}`}>
            <a className={pageStyles.heroCta} href={ctaHref}>
              Pedir una demo
            </a>
          </div>
        </div>
      </div>

      <div className={styles.mediaLayer}>
        <svg className={styles.orbit} viewBox="0 0 800 650" aria-hidden="true">
          <ellipse
            ref={ellipseRef}
            className={styles.orbitPath}
            cx={ORBIT_CX}
            cy={ORBIT_CY}
            rx={ORBIT_RX}
            ry={ORBIT_RY}
          />
          <circle ref={runnerRef} className={styles.runner} cx={runnerStart.x} cy={runnerStart.y} r={4} />
        </svg>
        <video
          ref={videoRef}
          className={styles.video}
          src="/media/nixgo-chef-full-loop.mp4"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
