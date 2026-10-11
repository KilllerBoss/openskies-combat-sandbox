# OpenSkies Unity-Starterkit

Dieses Kit spiegelt die Systeme des Web-Prototyps (`openskies`-Repository, `src/game/`)
nach **Unity 6 (C#)** — dieselbe Architektur, dieselben Formeln, dieselben Daten.
Ziel: das im Browser Gelernte in derselben Engine-Umgebung vertiefen, in der auch
kommerzielle Mobile-Titel (wie das analysierte Vorbild) gebaut werden.

## Inhalt

```
Assets/OpenSkiesKit/
  Scripts/
    Core/       GameManager, VehicleDatabase, GameInput
    Physics/    FlightModel, ShipModel, GroundModel, Vehicle
    Combat/     WeaponSystem, Projectile, HomingMissile, DamageSystem
    AI/         AIPilot
  Data/
    Vehicles.json   (Beispiel-Definitionen — identisches Schema wie im Web)
SETUP-GUIDE.md      (Schritt-für-Schritt, deutsch)
```

## Schnellstart (Kurzfassung — Details im SETUP-GUIDE.md)

1. Unity Hub → neues Projekt **Unity 6 (3D Core)**, kein Template-Extra nötig.
2. Den Ordner `Assets/OpenSkiesKit` in dein Projekt ziehen.
3. Leere Szene: `GameManager` auf ein leeres GameObject, `Vehicles.json` zuweisen.
4. Play → Falcon spawnt in der Luft, steuerbar mit W/S/A/D/Q/E + Shift/Strg,
   Leertaste = Kanone, F = Rakete.

## Die drei Bewegungsmodelle (Lernpfad)

| Klasse | Datei | Kernidee |
|---|---|---|
| Jet | `Physics/FlightModel.cs` | Kräfte (Schub/Auftrieb/Widerstand/Gravitation), Staudruck-Steuerautorität, Stall |
| Schiff | `Physics/ShipModel.cs` | Auftriebs-Feder an der Wasserlinie, träges Gierrate-Modell |
| Panzer | `Physics/GroundModel.cs` | Terrainabtastung + Hang-Ausrichtung + unabhängiger Turm |

Alle drei implementieren die Schnittstelle `IMovementModel` — genau wie im
Web-Prototyp (Strategie-Pattern). Ein Fahrzeug weiß nicht, WER es steuert
(Mensch-Tastatur, KI, später vielleicht Netzwerk) — es bekommt nur einen
`ControlInput`-Datensatz.

## Data-driven: eigenes Fahrzeug hinzufügen

`Assets/OpenSkiesKit/Data/Vehicles.json` um einen Eintrag erweitern:

```json
{
  "id": "meinjet",
  "name": "Mein erster Jet",
  "vehicleClass": "jet",
  "hp": 110,
  "physics": {
    "mass": 9000, "maxThrust": 150000, "wingArea": 38,
    "maxSpeed": 360, "stallSpeed": 64,
    "cd0": 0.02, "inducedK": 0.05, "clSlope": 4.6,
    "stallAngleDeg": 16, "maxPitchRate": 1.7, "maxRollRate": 3.8, "maxYawRate": 0.5,
    "armor": 0.1
  }
}
```

Im Spiel erscheint es sofort — kein Code ändern. **Übung:** verdopple `wingArea`
und fliege den Unterschied (mehr Auftrieb = engere Kurven, aber auch mehr
Widerstand → langsamerer Beschleunigung).

## Lizenz

MIT — gehört dir, tu damit was du willst. Kein Code aus dem analysierten
Original-Spiel enthalten.
