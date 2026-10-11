// ============================================================================
//  VehicleSpec — das Datenmodell (data-driven design).
//  Identisches Prinzip wie im Web-Prototyp (src/game/types.ts): Fahrzeuge
//  sind DATEN, kein Code. Dieses Script enthält nur Klassen + Loader.
//  Unity-typisch: JsonUtility statt Newtonsoft (kein Extra-Package nötig).
// ============================================================================
using System;
using System.Collections.Generic;
using UnityEngine;

namespace OpenSkiesKit.Core
{
    [Serializable]
    public class JetPhysicsSpec
    {
        public float mass = 9500f;          // kg
        public float maxThrust = 130000f;   // N
        public float wingArea = 32f;        // m²
        public float maxSpeed = 340f;       // m/s
        public float stallSpeed = 62f;      // m/s (HUD-Warnung)
        public float cd0 = 0.021f;          // Profilwiderstand
        public float inducedK = 0.055f;     // induzierter Widerstand k
        public float clSlope = 4.8f;        // dCL/dα pro rad
        public float stallAngleDeg = 16f;   // Abrisswinkel
        public float maxPitchRate = 1.9f;   // rad/s
        public float maxRollRate = 4.2f;
        public float maxYawRate = 0.55f;
        [Range(0f, 0.4f)] public float armor = 0.05f;
    }

    [Serializable]
    public class ShipPhysicsSpec
    {
        public float maxSpeed = 15f;
        public float accelTime = 5f;
        public float turnRate = 0.25f;
        [Range(0f, 0.4f)] public float armor = 0.3f;
    }

    [Serializable]
    public class TankPhysicsSpec
    {
        public float maxSpeed = 12f;
        public float reverseSpeed = 5f;
        public float turnRate = 0.8f;
        public float turretRate = 1.5f;
        [Range(0f, 0.4f)] public float armor = 0.35f;
    }

    [Serializable]
    public class CannonSpec
    {
        public float rate = 12f;        // Schuss/s
        public float damage = 8f;
        public float muzzleVelocity = 900f;
        public float spreadDeg = 0.8f;
        public int ammo = 300;
        public float regenPerSec = 4f;
        public float range = 1200f;
    }

    [Serializable]
    public class MissileSpec
    {
        public int count = 6;
        public float damage = 60f;
        public float lockTime = 2.5f;
        public float lockConeDeg = 25f;
        public float lockRange = 3000f;
        public float cooldown = 1.2f;
        public float speed = 450f;
        public float accel = 300f;
        public float turnRate = 2.4f;   // rad/s — das Ausweichfenster!
        public float burnTime = 3.5f;
        public float navConstant = 4f;  // N der proportionalen Navigation
    }

    /// <summary>Ein Fahrzeug — alles, was Menü & Engine wissen müssen.</summary>
    [Serializable]
    public class VehicleSpec
    {
        public string id;
        public string name;
        public string vehicleClass = "jet";   // "jet" | "ship" | "tank"
        public string role = "";
        public float hp = 100f;
        public JetPhysicsSpec jetPhysics;
        public ShipPhysicsSpec shipPhysics;
        public TankPhysicsSpec tankPhysics;
        public CannonSpec cannon;
        public MissileSpec missiles;
    }

    /// <summary>Wrapper, weil JsonUtility keine Top-Level-Arrays liest.</summary>
    [Serializable]
    public class VehicleList { public VehicleSpec[] vehicles; }

    /// <summary>
    /// Lädt Vehicles.json (Assets/OpenSkiesKit/Data/). Im Inspector dem
    /// GameManager zuweisen. Neue Einträge erscheinen ohne Neustart —
    /// genau wie im Web-Prototyp.
    /// </summary>
    public class VehicleDatabase : MonoBehaviour
    {
        [SerializeField] private TextAsset vehiclesJson;
        public List<VehicleSpec> All { get; private set; } = new List<VehicleSpec>();

        private void Awake()
        {
            if (vehiclesJson == null)
            {
                Debug.LogError("[VehicleDatabase] Keine Vehicles.json zugewiesen!");
                return;
            }
            var list = JsonUtility.FromJson<VehicleList>(vehiclesJson.text);
            All.AddRange(list.vehicles);
            Debug.Log($"[VehicleDatabase] {All.Count} Fahrzeuge geladen.");
        }

        public VehicleSpec ById(string id) =>
            All.Find(v => v.id == id) ?? All[0];
    }
}
