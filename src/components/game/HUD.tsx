'use client';

/**
 * HUD — imperative Anzeige über dem Canvas.
 *
 * Warum ohne React-State? Die Engine liefert 60 Werte/Sekunde. React würde
 * dafür 60 komplette Komponenten-ReRenders starten. Stattdessen schreiben
 * wir direkt in DOM-Knoten (refs) — die React-Welt merkt von dem Dauerfeuer
 * nichts. (Genau die Technik, mit der man HUDs auch in Unity/RN baut:
 * Daten-Pull statt Push.)
 */
import { useEffect, useRef, type RefObject } from 'react';
import { Volume2, VolumeX, Plane, Ship, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Engine } from '@/game/core/Engine';
import type { HudState, VehicleClass } from '@/game/types';

const RADAR_PX = 148;

const CONTACT_STYLE: Record<VehicleClass, { color: string; size: number }> = {
  jet: { color: '#ff5d5d', size: 3.5 },
  ship: { color: '#ffb347', size: 5 },
  tank: { color: '#9db56c', size: 4 },
};

export function HUD({
  engineRef, muted, onToggleMute, vehicleClass,
}: {
  engineRef: RefObject<Engine | null>;
  muted: boolean;
  onToggleMute: () => void;
  vehicleClass: VehicleClass;
}) {
  // --- DOM-Refs (alle pro Frame beschrieben) ---
  const speedRef = useRef<HTMLSpanElement>(null);
  const altRef = useRef<HTMLSpanElement>(null);
  const thrRef = useRef<HTMLDivElement>(null);
  const hpRef = useRef<HTMLDivElement>(null);
  const hpTxtRef = useRef<HTMLSpanElement>(null);
  const ammoRef = useRef<HTMLSpanElement>(null);
  const mslRef = useRef<HTMLSpanElement>(null);
  const scoreRef = useRef<HTMLSpanElement>(null);
  const killsRef = useRef<HTMLSpanElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const respawnRef = useRef<HTMLDivElement>(null);
  const stallRef = useRef<HTMLDivElement>(null);
  const incomingRef = useRef<HTMLDivElement>(null);
  const targetRef = useRef<HTMLDivElement>(null);
  const feedRef = useRef<HTMLDivElement>(null);
  const radarRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<HTMLSpanElement>(null);
  const worldRef = useRef<HTMLSpanElement>(null);
  const modeRef = useRef<HTMLSpanElement>(null);
  const vehRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let raf = 0;
    let lastFeedIds = '';

    const HINTS: Record<VehicleClass, string> = {
      jet: 'W/S Nase · A/D Rollen · Q/E Gieren · Shift/Strg Schub · Leertaste Kanone · F Rakete · C Kamera',
      ship: 'W/S Fahrt · A/D Ruder · Leertaste Flak · F SAM · C Kamera',
      tank: 'W/S Fahren · A/D Lenken · Leertaste Granate aufs Fadenkreuz · C Kamera',
    };

    const tick = () => {
      raf = requestAnimationFrame(tick);
      const e = engineRef.current;
      if (!e || !e.running) return;
      const h: HudState = e.getHudState();

      // --- Zahlen & Balken ---
      if (speedRef.current) speedRef.current.textContent = String(Math.round(h.speedKmh));
      if (altRef.current) altRef.current.textContent = String(Math.round(h.altitude));
      if (thrRef.current) thrRef.current.style.height = `${Math.round(h.throttle * 100)}%`;
      if (hpRef.current) hpRef.current.style.width = `${Math.max(0, (h.hp / h.maxHp) * 100)}%`;
      if (hpTxtRef.current) hpTxtRef.current.textContent = `${Math.max(0, Math.round(h.hp))}`;
      if (ammoRef.current) ammoRef.current.textContent = String(h.ammo);
      if (mslRef.current) mslRef.current.textContent = h.maxMissiles > 0 ? `${h.missiles}` : '—';
      if (scoreRef.current) scoreRef.current.textContent = String(h.score);
      if (killsRef.current) killsRef.current.textContent = String(h.kills);

      // --- Meldungen ---
      if (msgRef.current) {
        msgRef.current.textContent = h.message ?? '';
        msgRef.current.style.opacity = h.message ? '1' : '0';
      }
      if (respawnRef.current) {
        respawnRef.current.style.display = h.dead ? 'flex' : 'none';
        if (h.dead) {
          const s = respawnRef.current.querySelector('[data-seconds]');
          if (s) s.textContent = Math.ceil(h.respawnIn).toString();
        }
      }
      if (stallRef.current) stallRef.current.style.display = h.stall ? 'block' : 'none';
      if (incomingRef.current) incomingRef.current.style.display = h.incoming ? 'block' : 'none';
      if (camRef.current) camRef.current.textContent = h.cameraMode === 'cockpit' ? 'COCKPIT' : 'VERFOLGER';
      if (worldRef.current) worldRef.current.textContent = h.worldName;
      if (modeRef.current) modeRef.current.textContent = h.modeName;
      if (vehRef.current) vehRef.current.textContent = h.vehicleName;

      // --- Steuerungshinweis (statisch je Fahrzeugklasse) ---
      const hint = document.getElementById('os-hint');
      if (hint) hint.textContent = HINTS[vehicleClass];

      // --- Ziel-Marker ---
      if (targetRef.current) {
        const t = h.hasTarget ? h.target : null;
        if (t && t.visible) {
          targetRef.current.style.display = 'block';
          targetRef.current.style.left = `${t.x * 100}%`;
          targetRef.current.style.top = `${t.y * 100}%`;
          const ring = targetRef.current.querySelector<SVGCircleElement>('circle[data-ring]');
          if (ring) {
            const C = 2 * Math.PI * 26;
            ring.style.strokeDasharray = `${C}`;
            ring.style.strokeDashoffset = `${C * (1 - t.lockProgress)}`;
            ring.style.stroke = t.locked ? '#ff5d5d' : '#f5b544';
          }
          const dist = targetRef.current.querySelector('[data-dist]');
          if (dist) dist.textContent = `${Math.round(t.dist)} m`;
          targetRef.current.dataset.locked = t.locked ? '1' : '0';
        } else {
          targetRef.current.style.display = 'none';
        }
      }

      // --- Kill-Feed (nur bei Änderung neu bauen) ---
      if (feedRef.current) {
        const ids = h.killFeed.map((k) => k.id).join(',');
        if (ids !== lastFeedIds) {
          lastFeedIds = ids;
          feedRef.current.innerHTML = h.killFeed
            .map((k) => `<div class="${k.own ? 'text-amber-400' : 'text-zinc-400'}">▸ ${escapeHtml(k.text)}</div>`)
            .join('');
        }
      }

      // --- Radar ---
      const cv = radarRef.current;
      if (cv) {
        const g = cv.getContext('2d')!;
        const cx = RADAR_PX / 2;
        const cy = RADAR_PX / 2;
        const R = RADAR_PX / 2 - 4;
        g.clearRect(0, 0, RADAR_PX, RADAR_PX);
        g.fillStyle = 'rgba(10,13,16,0.72)';
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
        g.strokeStyle = 'rgba(245,181,68,0.35)';
        g.lineWidth = 1;
        g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.arc(cx, cy, R * 0.55, 0, Math.PI * 2); g.stroke();
        g.beginPath(); g.moveTo(cx - R, cy); g.lineTo(cx + R, cy); g.stroke();
        g.beginPath(); g.moveTo(cx, cy - R); g.lineTo(cx, cy + R); g.stroke();
        // Kontakt: oben = Flugrichtung (Koppelnavigation)
        for (const c of h.radar.contacts) {
          const s = CONTACT_STYLE[c.kind];
          const px = cx + (c.x / h.radar.range) * R;
          const py = cy - (c.z / h.radar.range) * R;
          g.fillStyle = s.color;
          g.beginPath(); g.arc(px, py, s.size, 0, Math.PI * 2); g.fill();
        }
        // Spieler: weißer Pfeil im Zentrum
        g.fillStyle = '#f4f4f5';
        g.beginPath();
        g.moveTo(cx, cy - 6); g.lineTo(cx - 4, cy + 4); g.lineTo(cx + 4, cy + 4);
        g.closePath(); g.fill();
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [engineRef, vehicleClass]);

  return (
    <div className="pointer-events-none absolute inset-0 select-none font-sans text-zinc-200">
      {/* --- Links unten: Fahrt · Höhe · Schub --- */}
      <div className="absolute bottom-4 left-4 flex items-end gap-4">
        <div className="rounded-lg border border-zinc-700/60 bg-black/55 px-4 py-3 backdrop-blur-sm">
          <div className="text-[9px] uppercase tracking-[0.25em] text-zinc-500">Fahrt</div>
          <div className="font-mono text-3xl font-bold tabular-nums text-zinc-100">
            <span ref={speedRef}>0</span><span className="ml-1 text-xs text-zinc-500">km/h</span>
          </div>
          <div className="mt-1 text-[9px] uppercase tracking-[0.25em] text-zinc-500">Höhe</div>
          <div className="font-mono text-xl tabular-nums text-zinc-300">
            <span ref={altRef}>0</span><span className="ml-1 text-xs text-zinc-500">m</span>
          </div>
        </div>
        <div className="flex h-28 flex-col items-center rounded-lg border border-zinc-700/60 bg-black/55 px-2 py-2 backdrop-blur-sm">
          <span className="text-[8px] uppercase tracking-widest text-zinc-500">Schub</span>
          <div className="relative mt-1 w-3 flex-1 overflow-hidden rounded-full bg-zinc-800">
            <div ref={thrRef} className="absolute bottom-0 left-0 w-full rounded-full bg-amber-500" style={{ height: '75%' }} />
          </div>
        </div>
      </div>

      {/* --- Rechts unten: Hülle · Munition --- */}
      <div className="absolute bottom-4 right-4 w-56 rounded-lg border border-zinc-700/60 bg-black/55 px-4 py-3 backdrop-blur-sm">
        <div className="flex items-center justify-between">
          <span className="text-[9px] uppercase tracking-[0.25em] text-zinc-500">Hülle</span>
          <span ref={hpTxtRef} className="font-mono text-sm tabular-nums text-zinc-200">100</span>
        </div>
        <div className="mt-1 h-2 overflow-hidden rounded-full bg-zinc-800">
          <div ref={hpRef} className="h-full rounded-full bg-emerald-500" style={{ width: '100%' }} />
        </div>
        <div className="mt-3 flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">Kanone</span>
          <span ref={ammoRef} className="font-mono tabular-nums text-zinc-200">300</span>
        </div>
        <div className="flex items-center justify-between text-[11px]">
          <span className="text-zinc-500">Raketen</span>
          <span ref={mslRef} className="font-mono tabular-nums text-zinc-200">6</span>
        </div>
      </div>

      {/* --- Oben links: Session-Info --- */}
      <div className="absolute left-4 top-4 rounded-lg border border-zinc-700/60 bg-black/55 px-3 py-2 backdrop-blur-sm">
        <div className="text-[10px] font-bold uppercase tracking-[0.25em] text-amber-400">OPENSKIES</div>
        <div className="mt-0.5 text-[10px] text-zinc-400">
          <span ref={vehRef} className="font-semibold text-zinc-200">—</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span ref={worldRef}>—</span>
          <span className="mx-1.5 text-zinc-600">·</span>
          <span ref={modeRef} className="text-zinc-500">—</span>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <span className="font-mono text-lg font-bold tabular-nums text-zinc-100"><span ref={scoreRef}>0</span></span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-500">Punkte</span>
          <span className="ml-2 font-mono text-sm tabular-nums text-zinc-300"><span ref={killsRef}>0</span></span>
          <span className="text-[9px] uppercase tracking-widest text-zinc-500">Abschüsse</span>
        </div>
      </div>

      {/* --- Oben rechts: Radar + Ton --- */}
      <div className="absolute right-4 top-4 flex flex-col items-end gap-2">
        <canvas ref={radarRef} width={RADAR_PX} height={RADAR_PX} className="rounded-full" />
        <Button
          variant="outline"
          size="icon"
          onClick={onToggleMute}
          className="pointer-events-auto h-8 w-8 border-zinc-700 bg-black/55 text-zinc-400 hover:text-zinc-100"
          aria-label={muted ? 'Ton einschalten' : 'Ton stummschalten'}
        >
          {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
        </Button>
      </div>

      {/* --- Kill-Feed --- */}
      <div ref={feedRef} className="absolute right-4 top-56 space-y-1 text-right font-mono text-[11px]" />

      {/* --- Fadenkreuz --- */}
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <svg width="34" height="34" viewBox="0 0 34 34">
          <circle cx="17" cy="17" r="14" fill="none" stroke="rgba(228,228,231,0.5)" strokeWidth="1" strokeDasharray="4 7" />
          <circle cx="17" cy="17" r="1.6" fill="#e4e4e7" />
        </svg>
      </div>

      {/* --- Ziel-Marker mit Lock-Ring --- */}
      <div ref={targetRef} className="absolute hidden -translate-x-1/2 -translate-y-1/2" style={{ left: '50%', top: '50%' }}>
        <svg width="64" height="64" viewBox="0 0 64 64" className="drop-shadow">
          <circle cx="32" cy="32" r="22" fill="none" stroke="rgba(245,181,68,0.45)" strokeWidth="1" />
          <circle
            data-ring
            cx="32" cy="32" r="26" fill="none"
            stroke="#f5b544" strokeWidth="2.5" strokeLinecap="round"
            transform="rotate(-90 32 32)"
          />
          <path d="M32 6 v8 M32 50 v8 M6 32 h8 M50 32 h8" stroke="#f5b544" strokeWidth="1.5" />
        </svg>
        <div data-dist className="mt-0.5 text-center font-mono text-[10px] text-amber-300">0 m</div>
      </div>

      {/* --- Warnungen --- */}
      <div ref={stallRef} className="absolute left-1/2 top-20 hidden -translate-x-1/2 animate-pulse rounded border border-red-500 bg-red-950/70 px-4 py-1 text-sm font-bold tracking-[0.2em] text-red-400">
        STRÖMUNGSABRISS — NASE RUNTER, FAHRT AUFNEHMEN
      </div>
      <div ref={incomingRef} className="absolute left-1/2 top-32 hidden -translate-x-1/2 animate-pulse rounded border border-red-500 bg-red-950/70 px-4 py-1 text-sm font-bold tracking-[0.2em] text-red-400">
        RAKETE IM ANFLUG — HART DREHEN
      </div>

      {/* --- Zentrale Meldung --- */}
      <div
        ref={msgRef}
        className="absolute left-1/2 top-1/3 -translate-x-1/2 text-2xl font-black tracking-[0.15em] text-amber-400 opacity-0 transition-opacity duration-300"
        style={{ textShadow: '0 2px 12px rgba(0,0,0,0.8)' }}
      />

      {/* --- Respawn-Overlay --- */}
      <div ref={respawnRef} className="absolute inset-0 hidden flex-col items-center justify-center bg-black/50 backdrop-blur-[2px]">
        <div className="text-4xl font-black tracking-[0.2em] text-red-500">ABGESCHOSSEN</div>
        <div className="mt-3 text-sm uppercase tracking-[0.25em] text-zinc-400">
          Respawn in <span data-seconds className="font-mono text-amber-400">2</span> s
        </div>
      </div>

      {/* --- Unten Mitte: Steuerungshinweis + Kamera --- */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-center">
        <div className="mb-1 text-[9px] uppercase tracking-[0.3em] text-zinc-600">
          Kamera <span ref={camRef} className="text-zinc-400">VERFOLGER</span> · [C]
        </div>
        <div id="os-hint" className="rounded bg-black/45 px-3 py-1 font-mono text-[10px] text-zinc-500 backdrop-blur-sm" />
      </div>
    </div>
  );
}

/** HTML im Kill-Feed entschärfen (Namen sind Daten, niemals Markup). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c] ?? c);
}
