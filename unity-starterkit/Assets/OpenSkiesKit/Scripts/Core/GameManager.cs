// ============================================================================
//  GameManager — Session-Lebenszyklus (Unity-Version, bewusst minimal).
//  Auf ein leeres GameObject legen, Vehicles.json-TextAsset zuweisen.
//  Erzeugt Spieler + KI-Flugzeuge, respawnt den Spieler, hält den Score.
//  ============================================================================
using UnityEngine;

namespace OpenSkiesKit.Core
{
    public class GameManager : MonoBehaviour
    {
        public static GameManager Instance { get; private set; }

        [Header("Konfiguration")]
        [SerializeField] private string playerId = "falcon";
        [SerializeField] private string[] aiIds = { "falke", "hornet", "viggen" };
        [SerializeField] private int aiCount = 3;
        [SerializeField] private Vector3 spawnPos = new(0f, 480f, -1400f);
        [SerializeField] private float spawnHeadingDeg;

        public Physics.Vehicle Player { get; private set; }
        private VehicleDatabase db;
        private float respawnT = -1f;

        private void Awake()
        {
            Instance = this;
            db = GetComponent<VehicleDatabase>();
            if (db == null)
                Debug.LogError("[GameManager] VehicleDatabase-Komponente fehlt! " +
                    "Leeres GameObject → Add Component → OpenSkiesKit.Core.VehicleDatabase, " +
                    "dort Vehicles.json zuweisen (siehe SETUP-GUIDE Schritt 3).");
        }

        private void Start()
        {
            SpawnAll();
            Combat.DamageSystem.OnKill += (victim, attacker) =>
                Debug.Log($"[Kill] {(attacker ? attacker.Spec.name : "Boden")} → {victim.Spec.name} · Score {Combat.DamageSystem.Score}");
        }

        private void SpawnAll()
        {
            Player = Spawn(db.ById(playerId), spawnPos, spawnHeadingDeg, true);

            for (int i = 0; i < aiCount && i < aiIds.Length; i++)
            {
                float ang = (i / 6f) * Mathf.PI * 2f;
                Vector3 pos = spawnPos + new Vector3(Mathf.Cos(ang) * 1800f, -100f, Mathf.Sin(ang) * 1800f);
                Spawn(db.ById(aiIds[i]), pos, ang * Mathf.Rad2Deg + 180f, false);
            }
        }

        private Physics.Vehicle Spawn(VehicleSpec spec, Vector3 pos, float headingDeg, bool isPlayer)
        {
            var go = new GameObject($"{spec.name} ({(isPlayer ? "Spieler" : "KI")})");
            go.transform.position = pos;
            go.transform.rotation = Quaternion.Euler(0f, headingDeg, 0f);

            // Platzhalter-Visual ( Setup-Guide: eigenes Mesh als Kind hängen )
            var visual = GameObject.CreatePrimitive(PrimitiveType.Cube);
            visual.transform.parent = go.transform;
            visual.transform.localScale = new Vector3(2f, 1f, 9f);
            visual.GetComponent<Renderer>().material.color = isPlayer
                ? new Color(0.95f, 0.72f, 0.2f) : new Color(0.55f, 0.58f, 0.6f);
            Object.Destroy(visual.GetComponent<Collider>()); // Kollision läuft über Parent-Collider

            var col = go.AddComponent<BoxCollider>();
            col.size = new Vector3(9f, 3f, 12f); // Trefferkugel-Äquivalent

            var vehicle = go.AddComponent<Physics.Vehicle>();
            vehicle.Init(spec, isPlayer);
            Combat.DamageSystem.Register(vehicle);

            if (!isPlayer) // KI-Jets bekommen Startfahrt
            {
                var rb = go.GetComponent<Rigidbody>();
                rb.linearVelocity = go.transform.forward * 200f;
            }
            return vehicle;
        }

        public void RespawnPlayer(float delay) => respawnT = delay;

        private void Update()
        {
            if (respawnT >= 0f)
            {
                respawnT -= Time.deltaTime;
                if (respawnT < 0f)
                {
                    if (Player != null) Destroy(Player.gameObject);
                    Player = Spawn(db.ById(playerId), spawnPos, spawnHeadingDeg, true);
                }
            }

            // Debug-HUD — nur alle 2 s (im echten Projekt: echte UI, SETUP-GUIDE Schritt 7)
            hudT += Time.deltaTime;
            if (Player != null && hudT > 2f)
            {
                hudT = 0f;
                Debug.Log($"[HUD] {Player.Speed * 3.6f:F0} km/h · {Player.transform.position.y:F0} m · " +
                          $"HP {Player.hp:F0} · Score {Combat.DamageSystem.Score}");
            }
        }

        private float hudT;
    }
}
