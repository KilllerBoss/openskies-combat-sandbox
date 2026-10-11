# LERNPFAD — OpenSkies Schritt für Schritt

Du hast jetzt zwei Lernumgebungen mit **denselben Systemen**:

- **Web** (`src/game/`): sofort spielbar, jede Zeile lesbar, TypeScript + Three.js
- **Unity** (`unity-starterkit/`): dieselbe Architektur in C# — der Weg zu
  echten Mobile-Titeln (das analysierte Vorbild läuft auf Unity 6 / IL2CPP)

Empfohlene Reihenfolge: erst im Web spielen & lesen, dann in Unity nachbauen.

---

## Lektion 1 — Fliegen lernen (30 min)

Starte **Falcon / Archipel / Freier Flug** und probiere:

1. Vollgas (Shift halten), dann auf ~600 km/h ziehen (W)
2. **Rollen + ziehen** = Kurve (A halten, dann W) — niemals nur gieren (Q/E)!
3. Langsam werden (Strg) bis die **STRÖMUNGSABRISS**-Warnung kommt: die Nase
   fällt, die Steuern werden teigig. Fahrt aufnehmen (Nase runter) beendet ihn.
4. Kamera-Taste **C** (Cockpit) und FOV-Kick bei Vollgas beachten

**Verstanden hast du Lektion 1, wenn du erklären kannst:** warum ein Flugzeug
in der Ebene seiner Tragflächen dreht und warum man im Langsamflug nicht
mehr ausweichen kann.

## Lektion 2 — Die Flugphysik lesen (1–2 h)

Öffne `src/game/physics/FlightModel.ts` — jede Kraft ist einzeln kommentiert.
Die vier Formeln, die das ganze Spiel tragen:

```
Staudruck    q = ½·ρ·v²
Auftrieb     L = q·S·CL(α)      senkrecht zum Fahrtwind
Widerstand   D = q·S·(CD0+k·CL²)  entgegen dem Fahrtwind
Schub        T = throttle·T_max  entlang der Nase
```

**Experimente (nur Zahlen ändern, Seite neu laden):**

| Ändern | Erwartung |
|---|---|
| `wingArea` verdoppeln | engere Kurven, aber trägeres Beschleunigen (mehr Drag) |
| `cd0` halbieren | höhere Endgeschwindigkeit |
| `stallAngle` auf 25° | fast nicht mehr abzurreißen (Arcade-Modus!) |
| `inducedK` verdoppeln | hartes Ziesten bremst dich brutal ab (Energiekampf!) |

Vergleiche danach `unity-starterkit/.../FlightModel.cs` — dieselben Formeln,
andere Welt (`AddForce`, `FixedUpdate`).

## Lektion 3 — Eigenes Flugzeug (30 min)

`src/game/data/vehicles.ts`: einen Eintrag kopieren, `id`/`name` ändern,
Werte anpassen, Modellparameter (`tailCount: 2`, `canards: true`, …) umbauen.
Starte — es erscheint sofort im Menü. Genau so arbeiteten die Entwickler des
Originals (dort: `ModernWarplanes.Definitions`-Assemblies — in der Analyse
des ersten Repos nachzulesen).

**GLB-Modelle einbinden** (rechtsfreie Quellen: kenney.nl, quaternius.com —
NICHT die Original-Assets!): Datei nach `public/models/`, im Eintrag
`model: { type: 'glb', src: '/models/mein-jet.glb', scale: 1 }`.

## Lektion 4 — Eine neue Welt (1 h)

`src/game/data/worlds.ts` + `src/game/world/WorldBuilder.ts`: Palette,
Nebel, Sonnenrichtung, Terrain-Parameter (`amplitude`, `octaves`,
`islandCount` …) sind reine Daten. Kopiere den Archipel-Eintrag, mache daraus
eine **Lavawelt** (Palette rot/schwarz, dichter Nebel, kleine Sonne).
`gradientCss` ist die Menü-Vorschau-Kachel.

## Lektion 5 — Kampf & KI (1–2 h)

- `combat/WeaponSystem.ts`: Lock-On-Logik (Kegel + Zeit) und Munition
- `entities/Missile.ts`: **Proportionale Navigation** `a = N·Vc·ω` mit
  limitierter Drehrate — deshalb kann man Raketen *out-turnen*. Teste es:
  Rakete auf dich abgefeuert lassen (Hinweisbanner!), dann hart drehen.
- `ai/AIPilot.ts`: PATROL → ENGAGE → EVADE. Die Kernfunktion `steerToward`
  übersetzt ein Weltziel in Roll-/Pitch-Befehle — dieselbe "Sprache", die
  auch deine Tastatur spricht (deshalb fühlen sich Bots "menschlich" an).

**Experiment:** KI aggressiver machen (in `updateJet` `missileCd` senken,
`angleTo`-Schwellen erhöhen) oder feiger (`stateT > 4.5` → `> 2`).

## Lektion 6 — Schiffe & Panzer (1 h)

`ShipModel.ts` (Auftriebs-Feder, träges Gierrate-Modell) und `GroundModel.ts`
(Terrainabtastung + unabhängiger Turm) zeigen: **andere Fahrzeuge = andere
Bewegungsmodelle, gleiche Schnittstelle** (`MovementModel`). Ein Schiff
hinzuzufügen kostet eine JSON-Definition + null Code.

## Lektion 7 — Der Sprung zu Unity (1 Nachmittag)

`unity-starterkit/SETUP-GUIDE.md` folgen. Was du wiedererkennst:
`FlightModel.cs` = dieselben Formeln, `AIPilot.cs` = dieselbe Zustandsmaschine,
`Vehicles.json` = dasselbe Schema. Neu: Rigidbody/PhysX, Inspector statt
Konfigurationscode, echte Terrain-Tools.

## Lektion 8 — Was das Original anders macht (30 min)

Vergleiche deine Architektur mit den Erkenntnissen aus dem Analyse-Repo
(`modern-warplanes-apk-analysis`, `reports/02_FINDINGS.md`):

| Du (Lernprojekt) | Original (kommerziell) |
|---|---|
| `vehicles.ts` / JSON | `Definitions`-Assemblies, Addressables-CDN |
| KI = Zustandsmaschine lokal | Server-autoritativ: Photon-Matchmaking, UDP-Kanal, Server validiert |
| Prozedurale Low-Poly-Modelle | 41 AssetBundles mit Flugzeugmodellen |
| Punkte im Browser-Speicher | UGS-Analytics, Play-Games-Login, IAP |

**Die wichtigste Erkenntnis:** Das Original kann "alles freischalten"
serverseitig prüfen, weil der Client dem Server nicht traut. Genau deshalb
war der ursprüngliche Modding-Wunsch technisch zum Scheitern verurteilt —
und genau deshalb baust du jetzt dein eigenes Spiel, in dem DU der Server bist.

## Danach?

- **Multiplayer**: Ersetze `InputManager`-Daten durch Netzwerk-Nachrichten —
  die Physik merkt den Unterschied nicht (Lektion 6 zeigt warum)
- **Mobile**: Unity-Starterkit auf Android exportieren (wie das Original)
- **Mehr Systeme**: Nachbrenner-Logik, Landefahrwerk, Tag/Nacht, Replays
