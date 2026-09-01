'use client';

import { useCallback, useEffect, useState } from 'react';

/**
 * Modo Monitor para las pantallas KDS (Cocina y Despacho).
 *
 * Antes, estas pantallas solo guardaban un booleano `isFullscreen` que
 * unicamente cambiaba el texto del boton -- nunca se pedia pantalla completa
 * al navegador ni se ocultaba el sidebar, asi que al hacer clic no pasaba
 * nada visible. Este hook si ejecuta la Fullscreen API real y mantiene el
 * estado sincronizado cuando el usuario sale con ESC o F11 (eventos que no
 * pasan por nuestro boton).
 */
export function useKdsFullscreen() {
  const [isFullscreen, setIsFullscreen] = useState(false);

  // El navegador puede salir de pantalla completa sin pasar por el boton
  // (tecla ESC, F11, cambio de pestana). Sin este listener el boton quedaba
  // diciendo "Salir Pantalla Completa" con la pantalla ya normal.
  useEffect(() => {
    const syncFromBrowser = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', syncFromBrowser);
    return () => document.removeEventListener('fullscreenchange', syncFromBrowser);
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await document.documentElement.requestFullscreen();
    } catch (e) {
      // Algunos navegadores/iOS Safari no permiten la Fullscreen API. En ese
      // caso al menos se activa el layout de monitor (sidebar oculto, tarjetas
      // grandes), que es lo que realmente importa en una pantalla de cocina.
      console.warn('Fullscreen API no disponible, usando solo layout de monitor:', e);
      setIsFullscreen((prev) => !prev);
    }
  }, []);

  return { isFullscreen, toggleFullscreen };
}
