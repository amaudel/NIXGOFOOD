/**
 * Traduce lo que hay en la base (columnas de la sucursal + filas de
 * escalones) a la configuracion que consume calcularMinutosExtra, y
 * arma el texto del rango que ve el cliente.
 *
 * Se separa del acceso a la base a proposito: aca vive la logica que
 * puede equivocarse (defaults, vencimiento del freno manual, escalones
 * inactivos) y se prueba sin tocar Supabase.
 */
import { describe, it, expect } from 'vitest';
import {
  mapearConfiguracionDemora,
  formatearRangoPreparacion,
  RETIRO_POR_DEFECTO,
} from '@/lib/prepTimeConfig';

const AHORA = new Date('2026-09-03T20:00:00Z');

function enMinutos(offset: number): string {
  return new Date(AHORA.getTime() + offset * 60_000).toISOString();
}

describe('mapearConfiguracionDemora', () => {
  it('sin sucursal cargada usa los valores por defecto y no estira nada', () => {
    const config = mapearConfiguracionDemora(null, [], AHORA);

    expect(config.escalones).toEqual([]);
    expect(config.minutosManuales).toBe(0);
    expect(config.automaticoActivo).toBe(true);
    expect(config.techoMinutos).toBe(30);
  });

  it('mapea las columnas de la sucursal', () => {
    const config = mapearConfiguracionDemora(
      {
        auto_delay_enabled: false,
        manual_extra_minutes: 12,
        manual_extra_until: null,
        max_extra_minutes: 45,
      },
      [],
      AHORA
    );

    expect(config.automaticoActivo).toBe(false);
    expect(config.minutosManuales).toBe(12);
    expect(config.techoMinutos).toBe(45);
  });

  it('descarta el freno manual cuando ya vencio', () => {
    const config = mapearConfiguracionDemora(
      {
        auto_delay_enabled: true,
        manual_extra_minutes: 20,
        manual_extra_until: enMinutos(-1),
        max_extra_minutes: 30,
      },
      [],
      AHORA
    );

    expect(config.minutosManuales).toBe(0);
  });

  it('respeta el freno manual mientras no vence', () => {
    const config = mapearConfiguracionDemora(
      {
        auto_delay_enabled: true,
        manual_extra_minutes: 20,
        manual_extra_until: enMinutos(30),
        max_extra_minutes: 30,
      },
      [],
      AHORA
    );

    expect(config.minutosManuales).toBe(20);
  });

  it('sin fecha de vencimiento el freno manual sigue vigente', () => {
    const config = mapearConfiguracionDemora(
      {
        auto_delay_enabled: true,
        manual_extra_minutes: 20,
        manual_extra_until: null,
        max_extra_minutes: 30,
      },
      [],
      AHORA
    );

    expect(config.minutosManuales).toBe(20);
  });

  it('mapea los escalones, incluido el tramo sin tope', () => {
    const config = mapearConfiguracionDemora(null, [
      { from_items: 0, to_items: 10, extra_minutes: 0, active: true },
      { from_items: 11, to_items: null, extra_minutes: 15, active: true },
    ], AHORA);

    expect(config.escalones).toEqual([
      { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
      { desdeItems: 11, hastaItems: null, minutosExtra: 15 },
    ]);
  });

  it('ignora los escalones desactivados', () => {
    const config = mapearConfiguracionDemora(null, [
      { from_items: 0, to_items: 10, extra_minutes: 0, active: true },
      { from_items: 11, to_items: null, extra_minutes: 15, active: false },
    ], AHORA);

    expect(config.escalones).toHaveLength(1);
  });
});

describe('formatearRangoPreparacion', () => {
  it('sin extra devuelve el rango base', () => {
    expect(formatearRangoPreparacion(15, 25, 0)).toBe('15-25 min');
  });

  it('suma el extra a los dos extremos', () => {
    expect(formatearRangoPreparacion(15, 25, 10)).toBe('25-35 min');
  });

  it('usa el rango por defecto cuando la sucursal no lo tiene cargado', () => {
    expect(formatearRangoPreparacion(null, null, 0)).toBe(
      `${RETIRO_POR_DEFECTO.min}-${RETIRO_POR_DEFECTO.max} min`
    );
  });

  it('no genera rangos negativos ante datos corruptos', () => {
    expect(formatearRangoPreparacion(-5, -1, 0)).toBe('0-0 min');
  });
});
