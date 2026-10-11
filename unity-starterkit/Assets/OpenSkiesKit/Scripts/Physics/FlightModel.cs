// ============================================================================
//  FlightModel — DAS HERZSTÜCK (Unity-Version).
//  1:1-Nachbildung von src/game/physics/FlightModel.ts des Web-Prototyps.
//
//  Warum FixedUpdate? Unitys Fixed Timestep (Project Settings → Time, default
//  0.02 = 50 Hz) ist das eingebaute Äquivalent zum Akkumulator der Web-Engine:
//  Physik IMMER im festen Takt, Rendering variabel. Dass Unity das "von Haus
//  aus" mitbringt, ist genau der Grund, warum professionelle Titel so bauen.
//
//  Konventionen: transform.forward = Nase, transform.up = oben (Unity-Standard).
//  Alle Formeln identisch zum Web-Prototyp — vergleiche die Kommentare!
// ============================================================================
using UnityEngine;

namespace OpenSkiesKit.Physics
{
    public class FlightModel : IMovementModel
    {
        // Luftdichte Meereshöhe (vereinfachte ISA, konstant)
        private const float RHO = 1.225f;
        // Referenz-Staudruck: unterhalb wird die Steuerung "teigig"
        private static readonly float QRef = 0.5f * RHO * 120f * 120f;

        public bool Crashed { get; private set; }
        public bool Stalling { get; private set; }
        public float AoA { get; private set; }
        public float Buffet { get; private set; }
        public float Throttle { get; private set; } = 0.75f;

        private readonly Core.JetPhysicsSpec spec;

        public FlightModel(Core.JetPhysicsSpec spec) => this.spec = spec;

        public float GetSpeed(Vector3 velocity) => velocity.magnitude;

        public void Update(float dt, Core.ControlInput input, Rigidbody rb)
        {
            Crashed = false;

            // 1) SCHUBHEBEL integrieren (Shift/Strg, ±0.45/s) — bleibt stehen
            Throttle = Mathf.Clamp(Throttle + input.throttle * 0.45f * dt, 0f, 1f);

            // 2) FAHRT & STAUDRUCK — q = ½·ρ·v², ALLE Luftkräfte skalieren damit
            float speed = rb.linearVelocity.magnitude;
            float q = 0.5f * RHO * speed * speed;

            // 3) ANSTELLWINKEL: Geschwindigkeit ins lokale System
            Vector3 vLocal = rb.transform.InverseTransformDirection(rb.linearVelocity);
            AoA = speed > 1f ? Mathf.Atan2(-vLocal.y, Mathf.Max(0.1f, vLocal.z)) : 0f;

            // 4) CL(α) MIT STALL — oberhalb stallAngle bricht der Auftrieb ein
            float cl;
            float absAoa = Mathf.Abs(AoA);
            if (absAoa < spec.stallAngleDeg * Mathf.Deg2Rad)
            {
                cl = spec.clSlope * AoA;
                Stalling = false;
                Buffet = 0f;
            }
            else
            {
                float over = absAoa - spec.stallAngleDeg * Mathf.Deg2Rad;
                float collapse = Mathf.Max(0.35f, 1f - over * 2.2f);
                cl = Mathf.Sign(AoA) * spec.clSlope * spec.stallAngleDeg * Mathf.Deg2Rad * collapse;
                Stalling = true;
                Buffet = Mathf.Min(1f, over * 3f + 0.3f);
            }

            // 5) KRÄFTE (als Kraft auf den Rigidbody — Unity rechnet F = m·a selbst)
            Vector3 force = Vector3.zero;
            Vector3 fwd = rb.transform.forward;

            // (a) Schub entlang der Nase
            force += fwd * (Throttle * spec.maxThrust);

            if (speed > 1f)
            {
                Vector3 vHat = rb.linearVelocity / speed;

                // (b) Auftrieb: senkrecht zum Fahrtwind, in der Symmetrieebene.
                //     Richtung = v̂ × rechte Achse — dreht MIT der Fluglage mit:
                //     Kurvenflug entsteht durch Rollen!
                Vector3 liftDir = Vector3.Cross(vHat, rb.transform.right).normalized;
                force += liftDir * (q * spec.wingArea * cl);

                // (c) Widerstand: CD = CD0 + k·CL² — induzierter Anteil wächst
                //     QUADRATISCH mit dem Auftrieb (deshalb kostet Ziehen Fahrt)
                float cd = spec.cd0 + spec.inducedK * cl * cl;
                force -= vHat * (q * spec.wingArea * cd);

                // (d) Seitenkraft: Rumpf/Seitenflosse dämpfen Schiebewinkel β
                float beta = Mathf.Atan2(vLocal.x, Mathf.Max(0.1f, vLocal.z));
                force += rb.transform.right * (-q * spec.wingArea * 1.2f * beta);
            }

            // (e) Gravitation — als Kraft, damit Masse korrekt skaliert
            force += Vector3.down * (9.81f * spec.mass);

            rb.AddForce(force, ForceMode.Force);

            // 6) LAGEREGLERUNG — Wunsch-Winkelraten × Steuerautorität
            float authority = Mathf.Clamp(q / QRef, 0.15f, 1f);
            float shake = Buffet * 0.06f;
            Vector3 rates = new Vector3(
                (-input.pitch * spec.maxPitchRate + Random.Range(-0.5f, 0.5f) * shake) * authority,
                (input.yaw * spec.maxYawRate + Random.Range(-0.5f, 0.5f) * shake) * authority,
                (-input.roll * spec.maxRollRate + Random.Range(-0.5f, 0.5f) * shake) * authority);
            // Rotation um lokale Achsen (Space.Self!) — analog zur rechten
            // Quaternion-Multiplikation q·dq im Web-Prototyp.
            rb.transform.Rotate(rates * Mathf.Rad2Deg * dt, Space.Self);

            // Stall-Nickmoment: die Nase "fällt" Richtung Fahrt
            if (Stalling)
                rb.transform.Rotate(-0.35f * Buffet * Mathf.Rad2Deg * dt, 0f, 0f, Space.Self);

            // 7) BODENPRÜFUNG (Terrain via Raycast, Wasser bei y=0)
            float groundY = SampleGround(rb.position);
            float surface = Mathf.Max(groundY, 0f);
            if (rb.position.y <= surface + 2.5f) Crashed = true;
        }

        public void Reset() { Throttle = 0.75f; Crashed = false; Stalling = false; Buffet = 0f; AoA = 0f; }

        /// <summary>Terrainhöhe — Unity-Terrain oder 0 (Meer).</summary>
        public static float SampleGround(Vector3 pos)
        {
            var t = UnityEngine.Terrain.activeTerrain;
            if (t != null)
            {
                Vector3 local = pos - t.transform.position;
                Vector3 size = t.terrainData.size;
                float nx = local.x / size.x, nz = local.z / size.z;
                if (nx >= 0f && nx <= 1f && nz >= 0f && nz <= 1f)
                    return t.transform.position.y + t.terrainData.GetInterpolatedHeight(nx, nz);
            }
            return 0f;
        }
    }
}
