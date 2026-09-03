/**
 * Corazon de los tiempos dinamicos: dada la carga de la cocina (items
 * pendientes) y la configuracion de la sucursal, cuantos minutos extra
 * se le suman al tiempo estimado.
 *
 * Es una funcion pura a proposito: el resto del sistema (consulta a la
 * base, cache, UI) puede fallar o cambiar, pero la regla de negocio
 * queda cubierta a fondo aca.
 */
import { describe, it, expect } from 'vitest';
import { calcularMinutosExtra, ConfiguracionDemora } from '@/lib/demoraPorCarga';

const BASE: ConfiguracionDemora = {
  escalones: [
    { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
    { desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
    { desdeItems: 26, hastaItems: null, minutosExtra: 20 },
  ],
  automaticoActivo: true,
  minutosManuales: 0,
  techoMinutos: 30,
};

function conf(cambios: Partial<ConfiguracionDemora> = {}): ConfiguracionDemora {
  return { ...BASE, ...cambios };
}

describe('calcularMinutosExtra', () => {
  describe('escalones', () => {
    it('no suma nada con la cocina tranquila', () => {
      expect(calcularMinutosExtra(5, conf())).toBe(0);
    });

    it('aplica el escalon del medio', () => {
      expect(calcularMinutosExtra(18, conf())).toBe(10);
    });

    it('respeta el borde inferior del tramo', () => {
      expect(calcularMinutosExtra(11, conf())).toBe(10);
    });

    it('respeta el borde superior del tramo', () => {
      expect(calcularMinutosExtra(25, conf())).toBe(10);
    });

    it('el tramo sin tope cubre cualquier carga', () => {
      expect(calcularMinutosExtra(500, conf({ techoMinutos: 999 }))).toBe(20);
    });

    it('sin escalones configurados no suma nada: la funcion es opt-in', () => {
      expect(calcularMinutosExtra(100, conf({ escalones: [] }))).toBe(0);
    });

    it('ante un hueco en la tabla usa el escalon inferior mas cercano', () => {
      const conHueco = conf({
        escalones: [
          { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
          // 11..19 sin cubrir
          { desdeItems: 20, hastaItems: null, minutosExtra: 15 },
        ],
      });

      expect(calcularMinutosExtra(14, conHueco)).toBe(0);
    });

    it('no se marea si los escalones vienen desordenados', () => {
      const desordenados = conf({
        escalones: [
          { desdeItems: 26, hastaItems: null, minutosExtra: 20 },
          { desdeItems: 0, hastaItems: 10, minutosExtra: 0 },
          { desdeItems: 11, hastaItems: 25, minutosExtra: 10 },
        ],
      });

      expect(calcularMinutosExtra(30, desordenados)).toBe(20);
    });
  });

  describe('freno manual', () => {
    it('con el automatico apagado solo cuenta lo manual', () => {
      expect(
        calcularMinutosExtra(40, conf({ automaticoActivo: false, minutosManuales: 5 }))
      ).toBe(5);
    });

    it('con el automatico apagado y sin manual no suma nada', () => {
      expect(calcularMinutosExtra(40, conf({ automaticoActivo: false }))).toBe(0);
    });

    it('gana el manual cuando es mayor que el automatico', () => {
      expect(calcularMinutosExtra(5, conf({ minutosManuales: 15 }))).toBe(15);
    });

    it('gana el automatico cuando es mayor que el manual', () => {
      expect(calcularMinutosExtra(30, conf({ minutosManuales: 5 }))).toBe(20);
    });

    it('no los suma: entre los dos gana el mayor, no la suma', () => {
      // automatico 20 + manual 10 daria 30; debe quedar 20.
      expect(calcularMinutosExtra(30, conf({ minutosManuales: 10 }))).toBe(20);
    });
  });

  describe('techo', () => {
    it('recorta el automatico que se pasa del techo', () => {
      expect(calcularMinutosExtra(30, conf({ techoMinutos: 15 }))).toBe(15);
    });

    it('recorta tambien lo cargado a mano', () => {
      expect(
        calcularMinutosExtra(0, conf({ minutosManuales: 90, techoMinutos: 30 }))
      ).toBe(30);
    });
  });

  describe('entradas defensivas', () => {
    it('trata una carga negativa como cocina vacia', () => {
      expect(calcularMinutosExtra(-3, conf())).toBe(0);
    });

    it('nunca devuelve un numero negativo', () => {
      expect(
        calcularMinutosExtra(5, conf({ minutosManuales: -10 }))
      ).toBe(0);
    });

    it('sin techo configurado no recorta', () => {
      expect(
        calcularMinutosExtra(30, conf({ techoMinutos: 0, minutosManuales: 0 }))
      ).toBe(20);
    });
  });
});
