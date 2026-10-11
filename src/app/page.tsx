'use client';

/**
 * OpenSkies — Kampf-Flug-Sandbox (Lernprojekt).
 *
 * Aufbau der Codebase (alles unter src/game/):
 *   physics/  Flug-, Schiffs- und Panzerphysik  ← HIER am meisten lernen
 *   data/     vehicles.ts & worlds.ts           ← HIER eigene Inhalte ergänzen
 *   ai/       Zustandsmaschine der Gegner
 *   combat/   Waffen & Schaden
 *   world/    prozedurale Welten (Terrain, Wasser, Himmel)
 *   render/   Modelle, Effekte, Kamera
 *   core/     Engine (Game-Loop) & Input
 */
import { GameShell } from '@/components/game/GameShell';

export default function Home() {
  return <GameShell />;
}
