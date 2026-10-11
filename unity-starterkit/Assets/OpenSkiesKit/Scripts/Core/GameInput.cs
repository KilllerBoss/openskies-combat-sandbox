// ============================================================================
//  GameInput — Tastatur → ControlInput (klassenspezifisch).
//  Spiegel von src/game/core/Input.ts. Wer steuert (Mensch/KI/Netzwerk)
//  interessiert die Physik nicht — sie bekommt nur diesen Datensatz.
//  ============================================================================
using UnityEngine;

namespace OpenSkiesKit.Core
{
    public struct ControlInput
    {
        public float pitch;    // -1..1
        public float roll;     // -1..1
        public float yaw;      // -1..1
        public float throttle; // -1..1 Achse
        public bool fire;      // halten
        public bool missile;   // Einmal-Taste
    }

    public static class GameInput
    {
        public static ControlInput Poll(string vehicleClass)
        {
            switch (vehicleClass)
            {
                case "ship":
                    return new ControlInput
                    {
                        yaw = Input.GetAxisRaw("Horizontal"),        // A/D = Ruder
                        throttle = Input.GetAxisRaw("Vertical"),      // W/S = Fahrt
                        fire = Input.GetKey(KeyCode.Space),
                        missile = Input.GetKeyDown(KeyCode.F),
                    };
                case "tank":
                    return new ControlInput
                    {
                        yaw = Input.GetAxisRaw("Horizontal"),        // A/D = Lenken
                        throttle = Input.GetAxisRaw("Vertical"),      // W/S = Fahren
                        fire = Input.GetKey(KeyCode.Space),
                        missile = Input.GetKeyDown(KeyCode.F),
                    };
                default: // jet
                    return new ControlInput
                    {
                        // W = Nase hoch (invertiert, weil +X-Rotation die Nase senkt)
                        pitch = (Input.GetKey(KeyCode.W) ? 1f : 0f) - (Input.GetKey(KeyCode.S) ? 1f : 0f),
                        roll = (Input.GetKey(KeyCode.A) ? 1f : 0f) - (Input.GetKey(KeyCode.D) ? 1f : 0f),
                        yaw = (Input.GetKey(KeyCode.E) ? 1f : 0f) - (Input.GetKey(KeyCode.Q) ? 1f : 0f),
                        throttle = (Input.GetKey(KeyCode.LeftShift) || Input.GetKey(KeyCode.LeftBracket) ? 1f : 0f)
                                 - (Input.GetKey(KeyCode.LeftControl) || Input.GetKey(KeyCode.RightBracket) ? 1f : 0f),
                        fire = Input.GetKey(KeyCode.Space),
                        missile = Input.GetKeyDown(KeyCode.F),
                    };
            }
        }
    }
}
