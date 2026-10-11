// ============================================================================
//  IMovementModel + Vehicle — Strategie-Pattern in Unity.
//  Vehicle (MonoBehaviour) besitzt Physik-Zustand + Waffen + (optional) KI.
//  Das Bewegungsmodell wird je nach vehicleClass aus der Spec gewählt.
//  ============================================================================
using UnityEngine;

namespace OpenSkiesKit.Physics
{
    /// <summary>Gemeinsame Schnittstelle der drei Bewegungsmodelle.</summary>
    public interface IMovementModel
    {
        bool Crashed { get; }
        bool Stalling { get; }
        float AoA { get; }
        float Throttle { get; }
        float GetSpeed(Vector3 velocity);
        void Update(float dt, Core.ControlInput input, Rigidbody rb);
        void Reset();
    }

    /// <summary>
    /// Ein Fahrbares. Setup: Rigidbody (Masse aus Spec!, Interpolate = Interpolate,
    /// Collision Detection = Continuous Dynamic), beliebiges Mesh als Kind.
    /// </summary>
    public class Vehicle : MonoBehaviour
    {
        public Core.VehicleSpec Spec { get; private set; }
        public bool IsPlayer { get; private set; }
        public IMovementModel Movement { get; private set; }
        public Combat.WeaponSystem Weapons { get; private set; }
        public AI.AIPilot Ai { get; private set; }

        [HideInInspector] public float hp;
        [HideInInspector] public bool alive = true;

        public float Speed => Movement.GetSpeed(GetComponent<Rigidbody>().linearVelocity);

        private Rigidbody rb;

        public void Init(Core.VehicleSpec spec, bool isPlayer)
        {
            Spec = spec;
            IsPlayer = isPlayer;
            rb = gameObject.AddComponent<Rigidbody>();
            rb.interpolation = RigidbodyInterpolation.Interpolate;
            rb.collisionDetectionMode = CollisionDetectionMode.ContinuousDynamic;

            switch (spec.vehicleClass)
            {
                case "ship":
                    Movement = new ShipModel(spec.shipPhysics);
                    rb.mass = 4000f;
                    break;
                case "tank":
                    Movement = new GroundModel(spec.tankPhysics);
                    rb.mass = 40f;
                    break;
                default:
                    Movement = new FlightModel(spec.jetPhysics);
                    rb.mass = spec.jetPhysics.mass;
                    rb.useGravity = false; // Gravitation steckt IM Flugmodell (als Kraft)
                    break;
            }

            hp = spec.hp;
            Weapons = new Combat.WeaponSystem(this, spec);
            if (!isPlayer) Ai = new AI.AIPilot(this);
        }

        private void FixedUpdate()
        {
            if (!alive) return;

            Core.ControlInput input = IsPlayer
                ? Core.GameInput.Poll(Spec.vehicleClass)
                : Ai.Poll(Time.fixedDeltaTime, this);

            Movement.Update(Time.fixedDeltaTime, input, rb);
            Weapons.Tick(Time.fixedDeltaTime, input);

            if (Movement.Crashed) Combat.DamageSystem.ReportCrash(this);
        }
    }
}
