'use client';

/**
 * GameShell — React-Fassade um die Engine.
 *
 * Trennung der Welten: React rendert NUR Overlays (Menü/HUD/Pause), die
 * Engine zeichnet auf einen <canvas> und weiß nichts von React. HUD-Daten
 * fließen per requestAnimationFrame &refs (NICHT per useState) in die UI —
 * 60 React-ReRenders pro Sekunde wären Overkill, DOM-Refs sind gratis.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Engine as GameEngine, StartConfig } from '@/game/core/Engine';
import { Engine } from '@/game/core/Engine';
import { VEHICLES_BY_ID } from '@/game/data/vehicles';
import type { VehicleClass } from '@/game/types';
import { MainMenu } from './MainMenu';
import { HUD } from './HUD';
import { PauseMenu } from './PauseMenu';

type Phase = 'menu' | 'playing' | 'paused';

export function GameShell() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [muted, setMuted] = useState(false);
  const [playerClass, setPlayerClass] = useState<VehicleClass>('jet');

  // Esc = Pause/Weiter (außer im Menü)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== 'Escape') return;
      setPhase((p) => {
        if (p === 'playing') {
          engineRef.current?.pause();
          return 'paused';
        }
        if (p === 'paused') {
          engineRef.current?.resume();
          return 'playing';
        }
        return p;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const start = useCallback((cfg: StartConfig) => {
    if (!canvasRef.current) return;
    if (!engineRef.current) {
      engineRef.current = new Engine(canvasRef.current);
    }
    setPlayerClass(VEHICLES_BY_ID[cfg.vehicleId]?.vehicleClass ?? 'jet');
    engineRef.current.setMuted(muted);
    engineRef.current.start(cfg);
    setPhase('playing');
  }, [muted]);

  const resume = useCallback(() => {
    engineRef.current?.resume();
    setPhase('playing');
  }, []);

  const toMenu = useCallback(() => {
    engineRef.current?.returnToMenu();
    setPhase('menu');
  }, []);

  const toggleMute = useCallback(() => {
    setMuted((m) => {
      engineRef.current?.setMuted(!m);
      return !m;
    });
  }, []);

  // Beim Verlassen der Seite sauber abbauen (WebGL-Kontext freigeben)
  useEffect(() => () => engineRef.current?.dispose(), []);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0b0e11]">
      <canvas ref={canvasRef} className="block h-full w-full" />

      {phase === 'menu' && <MainMenu onStart={start} />}
      {phase === 'playing' && <HUD engineRef={engineRef} muted={muted} onToggleMute={toggleMute} vehicleClass={playerClass} />}
      {phase === 'paused' && (
        <PauseMenu onResume={resume} onMenu={toMenu} muted={muted} onToggleMute={toggleMute} />
      )}
    </div>
  );
}
