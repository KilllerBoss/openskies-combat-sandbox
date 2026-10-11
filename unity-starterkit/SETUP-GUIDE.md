# OpenSkies Unity-Setup-Guide (deutsch)

Von null bis zum fliegenden Jet in ~15 Minuten. Du brauchst: **Unity Hub** mit
einer **Unity 6.x**-Installation (3D Core reicht — kein extra Package).

## Schritt 1 — Projekt anlegen

1. Unity Hub → **New Project**
2. Template: **3D (Core)** — Unity 6.x
3. Name z. B. `OpenSkiesUnity`, Speicherort frei
4. **Create project** (erster Start dauert ein paar Minuten)

## Schritt 2 — Kit importieren

1. Diesen Ordner `Assets/OpenSkiesKit` in den **Assets**-Ordner des Projekts
   kopieren (Finder/Explorer oder per Drag in das Project-Fenster).
2. Warten, bis Unity kompiliert hat (unten rechts dreht der Spinner).
3. Konsole (Window → General → Console) sollte **keine roten Fehler** zeigen.

## Schritt 3 — Szene aufbauen

1. **File → New Scene** (Basic/Standard), speichern als `Main.unity`
2. Leeres GameObject: Rechtsklick im Hierarchy-Fenster → **Create Empty**,
   umbenennen in `GameRoot`
3. Inspector → **Add Component** → `GameManager` (unter OpenSkiesKit.Core)
4. Add Component → `VehicleDatabase` (gleiche Stelle)
5. Im VehicleDatabase-Feld **Vehicles Json**: das Asset
   `Assets/OpenSkiesKit/Data/Vehicles` hineinziehen
   *(Falls das Feld das Asset nicht annimmt: Klick auf das Asset prüfen, dass
   es als TextAsset erkannt wird — .json in Assets wird automatisch eins.)*

## Schritt 4 — Terrain als Boden (wichtig für Panzer & Absturz-Logik)

1. Hierarchy → **3D Object → Terrain**
2. Terrain-Inspector → mittlerer Tab (Berge-Symbol) → **Paint Terrain →
   Raise/Lower** → mit gedrückter Maustaste Hügel malen
3. Position: X=0, Z=0 lassen; Y=0 = Meeresspiegel (Schiffe schwimmen bei y≈0)
4. Tipp für Archipel-Feeling: erst überall etwas anheben, dann mit der
   **Lower**-Bürste Inseln "freilegen"

Ohne Terrain gilt Bodenhöhe 0 — Jets können dann nur über y=2,5 hinaus
fliegen, Schiffe fahren auf y≈0. Für den ersten Test reicht das.

## Schritt 5 — Kamera anpassen

1. Main Camera auswählen, Position z. B. `(0, 500, -1440)`, Rotation `(10, 0, 0)`
2. Für den Anfang reicht eine starre Kamera; im Web-Prototyp gibt es die
   federgedämpfte Verfolgerkamera (`CameraRig.ts`) — **Übung Lektion 7**:
   baue sie in C# nach (`Camera.main.transform` hinter dem Spieler lerpen)

## Schritt 6 — Play!

▶ Drücken. Im Console-Fenster erscheint alle 2 s die HUD-Zeile
(`[HUD] 612 km/h · 480 m · HP 100 · Score 0`) — der Falcon startet mit
Fahrt und fliegt.

**Steuerung:** W/S Nase · A/D Rollen · Q/E Gieren · Shift/Strg (oder [ ])
Schub · Leertaste Kanone · F Rakete (Lock: Ziel 2,5 s in der Nase halten)

## Schritt 7 — Ausbauen (Lernpfad)

| Aufgabe | Wo |
|---|---|
| Eigenes Flugzeug (nur JSON!) | `Assets/OpenSkiesKit/Data/Vehicles.json` + GameManager → Player Id |
| Richtiges 3D-Modell statt Würfel | GLB/GLTF importieren, als Kind unter das Vehicle-GameObject |
| Verfolgerkamera | eigene `CameraRig.cs` schreiben (Vorbild: `render/CameraRig.ts`) |
| HUD als UI | Canvas + Text/Slider, Werte aus `GameManager.Player` ziehen |
| Explosions-Partikel | ParticleSystem-Prefab in `Combat.DamageSystem.Explode` instanziieren |
| Eigene Waffe | `CannonSpec`/`MissileSpec` erweitern — Formeln stehen im Code kommentiert |

## Häufige Stolpersteine

- **"Keine Vehicles.json zugewiesen"** → Schritt 3.5 wiederholen.
- **Jet fällt durch den Boden wie durch Butter?** Richtig so — Bodenkollision
  löst einen Abschuss (Respawn) aus, kein Landefahrwerk (wie im Web-Prototyp).
- **Rigidbody-Masse ignorieren?** Nein: `Vehicle.Init()` setzt sie aus der
  Spec. Wer sie im Inspector ändert, überschreibt die Physik-Definition.
- **Projektile fliegen durch Wände?** Sie raycasten pro FixedUpdate — bei
  sehr hohen Geschwindigkeiten Trefferlücke vergrößern (`Velocity.magnitude *
  Time.fixedDeltaTime + 2f` in `Projectile.FixedUpdate`).
- **FixedUpdate-Frequenz:** Project Settings → Time → Fixed Timestep (default
  0.02 = 50 Hz). Der Web-Prototyp nutzt 60 Hz — wer identisches Fluggefühl
  will, setzt 0.01667.

## Bezug zum Web-Prototyp

| Web (`src/game/`) | Unity (`Assets/OpenSkiesKit/Scripts/`) |
|---|---|
| `core/Engine.ts` (Loop, Spawns) | `Core/GameManager.cs` |
| `physics/FlightModel.ts` | `Physics/FlightModel.cs` (Formeln 1:1) |
| `combat/WeaponSystem.ts` + `entities/*` | `Combat/Combat.cs` |
| `ai/AIPilot.ts` | `AI/AIPilot.cs` (Zustandsmaschine 1:1) |
| `data/vehicles.ts` | `Data/Vehicles.json` |
