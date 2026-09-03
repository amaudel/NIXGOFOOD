// @vitest-environment jsdom
/**
 * Al recargar el panel las alertas aparecian como desactivadas ("⚠️
 * Activar alertas") aunque el navegador permitiera sonar perfectamente.
 *
 * No era una restriccion del navegador: el AudioContext no se creaba al
 * montar, asi que isAudioUnlocked se quedaba en false por defecto y nadie
 * llegaba a consultar el estado real. Se verifico en produccion que un
 * AudioContext recien creado ahi reporta "running".
 */
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

import { NewOrderAlertProvider } from '@/context/NewOrderAlertContext';
import { AudioAlertToggle } from '@/components/admin/AudioAlertToggle';

/** AudioContext de mentira, con el estado que le indiquemos. */
function stubAudioContext(estado: 'running' | 'suspended') {
  class FakeAudioContext {
    state = estado;
    currentTime = 0;
    destination = {};
    onstatechange: (() => void) | null = null;
    resume = vi.fn(async () => {});
    close = vi.fn(async () => {});
    createOscillator = vi.fn(() => ({
      type: '', frequency: { setValueAtTime: vi.fn() },
      connect: vi.fn(), start: vi.fn(), stop: vi.fn(),
    }));
    createGain = vi.fn(() => ({
      gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn(), linearRampToValueAtTime: vi.fn() },
      connect: vi.fn(),
    }));
  }
  vi.stubGlobal('AudioContext', FakeAudioContext);
  return FakeAudioContext;
}

function montar() {
  render(
    <NewOrderAlertProvider>
      <AudioAlertToggle />
    </NewOrderAlertProvider>
  );
}

describe('estado de las alertas al cargar el panel', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it('si el navegador permite sonar, arrancan activas sin pedir un clic', async () => {
    stubAudioContext('running');

    montar();

    await waitFor(() => {
      expect(screen.getByText(/Alertas activas/i)).toBeTruthy();
    });
    expect(screen.queryByText(/Activar alertas/i)).toBeNull();
  });

  it('si el navegador bloquea el audio, sigue pidiendo el clic', async () => {
    stubAudioContext('suspended');

    montar();

    await waitFor(() => {
      expect(screen.getByText(/Activar alertas/i)).toBeTruthy();
    });
  });

  it('respeta el silencio que el usuario dejo guardado', async () => {
    stubAudioContext('running');
    localStorage.setItem('kds_audio_muted', 'true');

    montar();

    await waitFor(() => {
      expect(screen.getByText(/Alertas silenciadas/i)).toBeTruthy();
    });
  });
});
