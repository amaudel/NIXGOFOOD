'use client';

import { type ReactNode, useEffect, useRef } from 'react';
import pageStyles from '@/app/page.module.css';
import styles from './FeatureReel.module.css';

export interface FeatureReelItem {
  no: string;
  station: string;
  body: ReactNode;
}

interface FeatureReelProps {
  items: FeatureReelItem[];
  videoSrc: string;
}

/**
 * Video centrado y fijo (position:sticky) detras de la fila de tickets;
 * cada ticket aparece alternando desde la izquierda/derecha al entrar en
 * el viewport (IntersectionObserver, no scroll-jacking: el scroll nativo
 * no se toca).
 */
export default function FeatureReel({ items, videoSrc }: FeatureReelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    videoRef.current?.play().catch(() => {});
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rows = rowRefs.current.filter((el): el is HTMLDivElement => el !== null);
    if (rows.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(styles.visible);
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.3, rootMargin: '0px 0px -10% 0px' }
    );
    rows.forEach((row) => observer.observe(row));
    return () => observer.disconnect();
  }, [items.length]);

  return (
    <div className={styles.stickyWrap}>
      <div className={styles.stickyMedia} aria-hidden="true">
        <video
          ref={videoRef}
          className={styles.video}
          src={videoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
        />
      </div>

      <div className={styles.cardsCol}>
        {items.map((item, i) => (
          <div
            key={item.no}
            ref={(el) => {
              rowRefs.current[i] = el;
            }}
            className={`${styles.cardRow} ${i % 2 === 0 ? styles.fromLeft : styles.fromRight}`}
          >
            <div className={`${pageStyles.ticket} ${styles.ticketCard}`}>
              <div className={pageStyles.ticketHead}>
                <span className={pageStyles.ticketNo}>{item.no}</span>
                <span className={pageStyles.ticketStation}>{item.station}</span>
              </div>
              <hr className={pageStyles.ticketRule} />
              <div className={pageStyles.ticketBody}>{item.body}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
