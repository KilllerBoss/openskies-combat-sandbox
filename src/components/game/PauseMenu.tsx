'use client';

/**
 * PauseMenu — Esc-Overlay: Fortsetzen, Steuerung, Ton, zurück ins Menü.
 */
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';

const CONTROLS: Array<[string, string]> = [
  ['W / S', 'Nase hoch / runter (Jets) · Fahrstufe (Schiff/Panzer)'],
  ['A / D', 'Rollen (Jets) · Lenken (Schiff/Panzer)'],
  ['Q / E', 'Gieren (Jets)'],
  ['Shift / Strg', 'Schub hoch / runter'],
  ['Leertaste', 'Hauptwaffe feuern'],
  ['F', 'Lenkrakete / SAM'],
  ['C', 'Kamera wechseln (Verfolger/Cockpit)'],
  ['Esc', 'Pause'],
];

export function PauseMenu({
  onResume, onMenu, muted, onToggleMute,
}: {
  onResume: () => void;
  onMenu: () => void;
  muted: boolean;
  onToggleMute: () => void;
}) {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <Card className="w-[min(92vw,480px)] border-zinc-700 bg-zinc-900 p-6">
        <h2 className="text-center text-xl font-black uppercase tracking-[0.35em] text-zinc-100">
          Pause
        </h2>

        <div className="mt-6 space-y-2">
          <Button
            onClick={onResume}
            className="w-full bg-amber-500 text-base font-bold uppercase tracking-widest text-black hover:bg-amber-400"
          >
            <Play className="mr-2 h-4 w-4" />
            Fortsetzen
          </Button>
          <Button
            onClick={onToggleMute}
            variant="outline"
            className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            {muted ? <VolumeX className="mr-2 h-4 w-4" /> : <Volume2 className="mr-2 h-4 w-4" />}
            Ton: {muted ? 'aus' : 'an'}
          </Button>
          <Button
            onClick={onMenu}
            variant="outline"
            className="w-full border-zinc-700 text-zinc-300 hover:bg-zinc-800"
          >
            <RotateCcw className="mr-2 h-4 w-4" />
            Zurück zum Menü
          </Button>
        </div>

        <div className="mt-6 border-t border-zinc-800 pt-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.3em] text-zinc-500">Steuerung</div>
          <div className="space-y-1">
            {CONTROLS.map(([k, d]) => (
              <div key={k} className="flex items-center gap-3 text-[12px] text-zinc-400">
                <kbd className="min-w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-center font-mono text-[10px] text-amber-400">
                  {k}
                </kbd>
                <span>{d}</span>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
