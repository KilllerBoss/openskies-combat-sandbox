// ============================================================================
//  ShipModel & GroundModel — Schiffs- und Panzerbewegung (Unity-Version).
//  Spiegel von ShipModel.ts / GroundModel.ts. Zusammen in einer Datei, weil
//  beide kompakt sind und gut nebeneinander lesbar.
//  ============================================================================
using UnityEngine;

namespace OpenSkiesKit.Physics
{
    /// <summary>
    /// Schiff: y per Auftriebs-Feder an der Wasserlinie, träges Gierrate-Modell,
    /// kosmetisches Rollen/Nicken aus der Wellenphase. Kein Rigidbody-Rotieren
    /// durch Wellen — wir STEUERN die Lage, statt sie simulieren zu lassen.
    /// </summary>
    public class ShipModel : IMovementModel
    {
        public bool Crashed => false;
        public bool Stalling => false;
        public float AoA => 0f;

        public float Throttle { get; private set; } = 0.3f;
        public float Speed { get; private set; }
        private float headingRate;
        private float wavePhase;

        private readonly Core.ShipPhysicsSpec spec;

        public ShipModel(Core.ShipPhysicsSpec spec) => this.spec = spec;

        public float GetSpeed(Vector3 velocity) => Speed;

        public void Update(float dt, Core.ControlInput input, Rigidbody rb)
        {
            // Schub spult mit 1/accelTime auf (träge Maschinen)
            Throttle = Mathf.Clamp01(Throttle + input.throttle * dt / spec.accelTime);
            float targetSpeed = Throttle * spec.maxSpeed;
            Speed = Mathf.MoveTowards(Speed, targetSpeed, spec.maxSpeed * dt / spec.accelTime);

            // Gierrate nähert sich dem Ruderbefehl träge an
            headingRate = Mathf.MoveTowards(headingRate, input.yaw * spec.turnRate, spec.turnRate * dt * 2f);
            rb.transform.Rotate(0f, headingRate * Mathf.Rad2Deg * dt, 0f, Space.Self);

            // Vorwärts entlang der Nase
            Vector3 pos = rb.position + rb.transform.forward * (Speed * dt);

            // Auftriebs-Feder zur Wasserlinie + Wellenbobbing
            wavePhase += dt * 1.4f;
            float wave = Mathf.Sin(wavePhase) * 0.35f;
            pos.y = Mathf.Lerp(pos.y, wave, 1f - Mathf.Exp(-8f * dt));

            // Kosmetisches Rollen/Nicken aus Wellen + Kurvenkräfte
            float heel = -headingRate * 0.6f + Mathf.Sin(wavePhase * 0.7f) * 0.02f;
            float pitch = Mathf.Sin(wavePhase) * 0.015f;
            rb.Move(Position: pos, Rotation: Quaternion.Euler(pitch * Mathf.Rad2Deg, rb.transform.eulerAngles.y, heel * Mathf.Rad2Deg));

            rb.linearVelocity = rb.transform.forward * Speed;
        }

        public void Reset() { Throttle = 0.3f; Speed = 0f; headingRate = 0f; wavePhase = Random.value * Mathf.PI * 2f; }
    }

    /// <summary>
    /// Panzer: Wanne folgt dem Terrain (Höhe + Hang-Normale), unabhängiger Turm
    /// mit begrenzter Drehrate — schnelle Vorbeiflüge kann er nicht verfolgen.
    /// </summary>
    public class GroundModel : IMovementModel
    {
        public bool Crashed => false;
        public bool Stalling => false;
        public float AoA => 0f;

        public float Throttle { get; private set; }
        public float TurretYaw { get; private set; }
        public float TurretPitch { get; private set; }

        private float speed;
        private float headingRate;

        private readonly Core.TankPhysicsSpec spec;

        public GroundModel(Core.TankPhysicsSpec spec) => this.spec = spec;

        public float GetSpeed(Vector3 velocity) => Mathf.Abs(speed);

        public void Update(float dt, Core.ControlInput input, Rigidbody rb)
        {
            // Fahren (W/S) + Kettenwendung (A/D, auch im Stand!)
            float target = input.throttle >= 0 ? input.throttle * spec.maxSpeed : input.throttle * spec.reverseSpeed;
            speed = Mathf.MoveTowards(speed, target, spec.maxSpeed * dt);
            headingRate = Mathf.MoveTowards(headingRate, input.yaw * spec.turnRate, spec.turnRate * dt * 2.5f);

            var tr = rb.transform;
            Quaternion heading = Quaternion.AngleAxis(headingRate * Mathf.Rad2Deg * dt, Vector3.up) * Quaternion.LookRotation(tr.forward, Vector3.up);
            Vector3 forward = heading * Vector3.forward;
            Vector3 pos = tr.position + forward * (speed * dt);

            // Terrain: Höhe & Normale abtasten, Wanne an den Hang schmiegen
            float groundY = FlightModel.SampleGround(pos);
            pos.y = groundY + 1.1f;
            Vector3 normal = SampleNormal(pos);
            Quaternion slope = Quaternion.LookRotation(forward, normal);

            rb.Move(pos, slope);
            rb.linearVelocity = forward * speed;

            // Turm: folgt dem Kamera-Fadenkreuz — Drehrate begrenzt, schnelle
            // Vorbeiflüge kann er nicht verfolgen (turretRate!)
            if (Camera.main != null)
            {
                Ray ray = Camera.main.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0f));
                Vector3 aim = Physics.Raycast(ray, out RaycastHit hit, 3000f) ? hit.point : ray.GetPoint(1500f);
                Vector3 local = tr.InverseTransformPoint(aim);
                float targetYaw = Mathf.Atan2(local.x, local.z);
                float targetPitch = Mathf.Atan2(local.y, Mathf.Sqrt(local.x * local.x + local.z * local.z));
                // Kürzester Winkelweg (DeltaAngle) + Ratenlimit
                float yawDelta = Mathf.DeltaAngle(TurretYaw * Mathf.Rad2Deg, targetYaw * Mathf.Rad2Deg) * Mathf.Deg2Rad;
                TurretYaw += Mathf.Clamp(yawDelta, -spec.turretRate * dt, spec.turretRate * dt);
                TurretPitch = Mathf.MoveTowards(TurretPitch, Mathf.Clamp(targetPitch, -0.12f, 0.55f), spec.turretRate * dt);
            }
        }

        public void Reset() { speed = 0f; headingRate = 0f; TurretYaw = 0f; TurretPitch = 0f; }

        private static Vector3 SampleNormal(Vector3 pos)
        {
            float hL = FlightModel.SampleGround(pos - Vector3.left * 2f);
            float hR = FlightModel.SampleGround(pos + Vector3.left * 2f);
            float hD = FlightModel.SampleGround(pos - Vector3.forward * 2f);
            float hU = FlightModel.SampleGround(pos + Vector3.forward * 2f);
            return new Vector3(hL - hR, 4f, hD - hU).normalized;
        }
    }
}
