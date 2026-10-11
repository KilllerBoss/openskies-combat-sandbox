'use client';

/**
 * MainMenu — Fahrzeug-, Welt- und Moduswahl.
 *
 * Reiner Daten-Browser: Alles, was hier angezeigt wird, kommt aus
 * vehicles.ts / worlds.ts — ein neues Fahrzeug erscheint automatisch,
 * sobald es in der Datei steht (data-driven design in Aktion).
 */
import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plane, Ship, Truck, Wind, Crosshair, Layers, Play, ChevronDown } from 'lucide-react';
import { VEHICLES } from '@/game/data/vehicles';
import { WORLDS } from '@/game/data/worlds';
import type { GameModeId, VehicleClass, VehicleSpec } from '@/game/types';
import type { StartConfig } from '@/game/core/Engine';

const CLASS_ICON: Record<VehicleClass, typeof Plane> = {
  jet: Plane, ship: Ship, tank: Truck,
};
const CLASS_LABEL: Record<VehicleClass, string> = {
  jet: 'Jet', ship: 'Schiff', tank: 'Panzer',
};

const MODES: Array<{ id: GameModeId; name: string; icon: typeof Wind; desc: string }> = [
  { id: 'free', name: 'Freier Flug', icon: Wind, desc: 'Keine Gegner — Physik und Welten in Ruhe erkunden.' },
  { id: 'dogfight', name: 'Hundekampf', icon: Crosshair, desc: 'Nur KI-Jets: klassisches Dogfighting gegen 3–5 Gegner.' },
  { id: 'mixed', name: 'Gemischtes Gefecht', icon: Layers, desc: 'Die Welt-Mischung: Jets, Schiffs-Flak und Panzer.' },
];

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-20 shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">{label}</span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-amber-500"
          style={{ width: `${Math.round(value * 100)}%` }}
        />
      </div>
    </div>
  );
}

function VehicleCard({
  spec, selected, onSelect,
}: { spec: VehicleSpec; selected: boolean; onSelect: () => void }) {
  const Icon = CLASS_ICON[spec.vehicleClass];
  return (
    <button
      type="button"
      onClick={onSelect}
      className={`group w-full rounded-lg border p-3 text-left transition-colors ${
        selected
          ? 'border-amber-500 bg-amber-500/10'
          : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600 hover:bg-zinc-900'
      }`}
    >
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Icon className={`h-4 w-4 ${selected ? 'text-amber-400' : 'text-zinc-400'}`} />
          <span className="font-semibold tracking-wide text-zinc-100">{spec.name}</span>
        </div>
        <Badge variant="outline" className="border-zinc-700 text-[10px] text-zinc-400">
          {CLASS_LABEL[spec.vehicleClass]}
        </Badge>
      </div>
      <p className="mb-2 text-[11px] leading-snug text-zinc-500">{spec.role}</p>
      <div className="space-y-1">
        <StatBar label="Tempo" value={spec.stats.speed} />
        <StatBar label="Wendig" value={spec.stats.agility} />
        <StatBar label="Hülle" value={spec.stats.armor} />
        <StatBar label="Waffen" value={spec.stats.firepower} />
      </div>
      <p className="mt-2 hidden text-[10px] leading-snug text-zinc-600 group-hover:block">{spec.description}</p>
    </button>
  );
}

export function MainMenu({ onStart }: { onStart: (cfg: StartConfig) => void }) {
  const [vehicleId, setVehicleId] = useState('falcon');
  const [worldId, setWorldId] = useState('archipelago');
  const [mode, setMode] = useState<GameModeId>('dogfight');
  const [classFilter, setClassFilter] = useState<VehicleClass | 'all'>('all');
  const [controlsOpen, setControlsOpen] = useState(false);

  const vehicles = useMemo(
    () => (classFilter === 'all' ? VEHICLES : VEHICLES.filter((v) => v.vehicleClass === classFilter)),
    [classFilter],
  );

  return (
    <div className="absolute inset-0 flex flex-col bg-[#0b0e11]/97 backdrop-blur-sm">
      {/* Kopf */}
      <header className="shrink-0 border-b border-zinc-800/80 px-6 pt-6 pb-4 text-center">
        <h1 className="text-4xl font-black tracking-[0.35em] text-zinc-100 sm:text-5xl">
          OPEN<span className="text-amber-500">SKIES</span>
        </h1>
        <p className="mt-2 text-xs uppercase tracking-[0.25em] text-zinc-500">
          Kampf-Flug-Sandbox · Lernprojekt
        </p>
      </header>

      {/* Inhalt */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="mx-auto max-w-5xl space-y-8 px-4 py-6 sm:px-6">
          {/* 1 — Fahrzeug */}
          <section>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">
                1 · Fahrzeug
              </h2>
              <div className="flex gap-1">
                {(['all', 'jet', 'ship', 'tank'] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setClassFilter(f)}
                    className={`rounded px-2.5 py-1 text-[11px] uppercase tracking-wider transition-colors ${
                      classFilter === f
                        ? 'bg-amber-500 font-semibold text-black'
                        : 'bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                    }`}
                  >
                    {f === 'all' ? 'Alle' : CLASS_LABEL[f] + 'n'}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {vehicles.map((v) => (
                <VehicleCard
                  key={v.id}
                  spec={v}
                  selected={v.id === vehicleId}
                  onSelect={() => setVehicleId(v.id)}
                />
              ))}
            </div>
          </section>

          {/* 2 — Welt */}
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">2 · Welt</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {WORLDS.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => setWorldId(w.id)}
                  className={`overflow-hidden rounded-lg border text-left transition-colors ${
                    worldId === w.id ? 'border-amber-500' : 'border-zinc-800 hover:border-zinc-600'
                  }`}
                >
                  <div className="h-20 w-full" style={{ background: w.gradientCss }} />
                  <div className="bg-zinc-900/80 p-3">
                    <div className="font-semibold text-zinc-100">{w.name}</div>
                    <div className="mt-0.5 text-[11px] text-zinc-500">{w.tagline}</div>
                  </div>
                </button>
              ))}
            </div>
          </section>

          {/* 3 — Modus */}
          <section>
            <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.3em] text-zinc-400">3 · Modus</h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {MODES.map((m) => {
                const Icon = m.icon;
                const active = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setMode(m.id)}
                    className={`flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                      active ? 'border-amber-500 bg-amber-500/10' : 'border-zinc-800 bg-zinc-900/60 hover:border-zinc-600'
                    }`}
                  >
                    <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${active ? 'text-amber-400' : 'text-zinc-400'}`} />
                    <div>
                      <div className="text-sm font-semibold text-zinc-100">{m.name}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-zinc-500">{m.desc}</div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Steuerung */}
          <section>
            <button
              type="button"
              onClick={() => setControlsOpen((o) => !o)}
              className="flex w-full items-center justify-between rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-2.5 text-xs uppercase tracking-[0.2em] text-zinc-400 hover:text-zinc-200"
            >
              Steuerung
              <ChevronDown className={`h-4 w-4 transition-transform ${controlsOpen ? 'rotate-180' : ''}`} />
            </button>
            {controlsOpen && (
              <Card className="mt-2 border-zinc-800 bg-zinc-900/60 p-4">
                <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 text-[12px] text-zinc-400 sm:grid-cols-2">
                  {[
                    ['W / S', 'Nase hoch / runter (Jets)'],
                    ['A / D', 'Rollen (Jets) · Lenken (Schiff/Panzer)'],
                    ['Q / E', 'Gieren'],
                    ['Shift / Strg', 'Schub hoch / runter · Fahrstufe'],
                    ['[ / ]', 'Schub-Alternative (Strg+W-frei)'],
                    ['Leertaste', 'Kanone / Flak / Granate'],
                    ['F', 'Lenkrakete / SAM'],
                    ['C', 'Kamera: Verfolger ↔ Cockpit'],
                    ['Esc', 'Pause'],
                  ].map(([k, d]) => (
                    <div key={k} className="flex items-center gap-3">
                      <kbd className="min-w-24 rounded border border-zinc-700 bg-zinc-950 px-2 py-0.5 text-center font-mono text-[11px] text-amber-400">
                        {k}
                      </kbd>
                      <span>{d}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </section>
        </div>
      </ScrollArea>

      {/* Fuß mit Start */}
      <footer className="shrink-0 border-t border-zinc-800/80 bg-[#0b0e11] px-6 py-4">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p className="hidden text-[11px] text-zinc-600 sm:block">
            Desktop + Tastatur empfohlen · Ton an · Alle Werte data-driven (src/game/data)
          </p>
          <Button
            size="lg"
            onClick={() => onStart({ vehicleId, worldId, mode })}
            className="bg-amber-500 px-10 text-base font-black uppercase tracking-widest text-black hover:bg-amber-400"
          >
            <Play className="mr-2 h-5 w-5" />
            Starten
          </Button>
        </div>
      </footer>
    </div>
  );
}
