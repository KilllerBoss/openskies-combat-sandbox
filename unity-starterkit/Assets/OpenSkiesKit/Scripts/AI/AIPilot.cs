// ============================================================================
//  AIPilot — die Gegner-Gehirne (Unity-Version).
//  Zustandsmaschine PATROL → ENGAGE → EVADE, identisch zum Web-Prototyp.
//  Kernstück: steerToward() — "Ziel auf die Hochachse rollen, dann ziehen".
//  ============================================================================
using UnityEngine;

namespace OpenSkiesKit.AI
{
    public class AIPilot
    {
        private enum State { Patrol, Engage, Evade }
        private State state = State.Patrol;
        private float stateT, evadeDir = 1f, evadeTurnT, patrolAngle, missileCd;

        private readonly Physics.Vehicle self;

        public AIPilot(Physics.Vehicle self)
        {
            this.self = self;
            patrolAngle = Random.value * Mathf.PI * 2f;
            missileCd = 4f + Random.value * 6f;
        }

        public Core.ControlInput Poll(float dt, Physics.Vehicle playerOrNull)
        {
            stateT += dt;
            missileCd -= dt;
            var input = new Core.ControlInput();

            var gm = Core.GameManager.Instance;
            var player = gm != null && gm.Player != null && gm.Player.alive ? gm.Player : null;

            // Übergänge
            if (state != State.Evade && (self.hp < self.Spec.hp * 0.3f))
            { state = State.Evade; stateT = 0f; evadeDir = Random.value < 0.5f ? -1f : 1f; }
            if (state == State.Evade && stateT > 4.5f) { state = player ? State.Engage : State.Patrol; stateT = 0f; }
            if (state == State.Patrol && player && stateT > 1f &&
                Vector3.Distance(self.transform.position, player.transform.position) < 2800f)
            { state = State.Engage; stateT = 0f; }

            if (self.Spec.vehicleClass != "jet")
            {
                // Schiffe/Panzer: nur leicht kurven — Feuern macht die WeaponSystem
                input.yaw = Mathf.Sin(Time.time * 0.15f + patrolAngle) * 0.4f;
                input.throttle = 0.25f;
                return input;
            }

            switch (state)
            {
                case State.Evade:
                    evadeTurnT -= dt;
                    if (evadeTurnT <= 0f) { evadeTurnT = 1.1f + Random.value * 0.8f; evadeDir *= -1f; }
                    input.roll = evadeDir;
                    input.pitch = 0.85f;
                    input.throttle = 1f;
                    break;

                case State.Patrol:
                    patrolAngle += dt * 0.12f;
                    SteerToward(new Vector3(Mathf.Cos(patrolAngle) * 900f, 420f, Mathf.Sin(patrolAngle) * 900f), input);
                    input.throttle = 0.5f;
                    break;

                case State.Engage:
                    if (player == null) { state = State.Patrol; break; }
                    // Vorhalt: Zielposition + Fahrt · Annäherungszeit
                    float dist = Vector3.Distance(self.transform.position, player.transform.position);
                    float t = Mathf.Min(dist / 320f, 4f);
                    Vector3 goal = player.transform.position + player.GetComponent<Rigidbody>().linearVelocity * (t * 0.8f);
                    SteerToward(goal, input);
                    input.throttle = 1f;
                    input.fire = dist < 950f && AngleTo(player.transform.position) < 0.24f;
                    input.missile = dist > 700f && dist < 2500f && AngleTo(player.transform.position) < 0.18f && missileCd <= 0f;
                    if (input.missile) missileCd = 9f + Random.value * 8f;
                    break;
            }
            return input;
        }

        /// <summary>
        /// Kernstück: Weltziel → Achsen.
        /// 1. Ziel ins lokale System rechnen 2. roll: Ziel auf Hochachse bringen
        /// 3. pitch: ziehen, wenn es "oben" ist. Bodennähe überschreibt alles.
        /// </summary>
        private void SteerToward(Vector3 goal, Core.ControlInput input)
        {
            Vector3 local = self.transform.InverseTransformPoint(goal);

            float groundY = Physics.FlightModel.SampleGround(self.transform.position);
            if (self.transform.position.y - groundY < 170f)
            {
                input.pitch = 1f; // immer hochziehen
                return;
            }

            input.roll = Mathf.Clamp(local.x * 2.6f, -1f, 1f);
            bool aligned = Mathf.Abs(local.x) < 0.45f;
            input.pitch = aligned ? Mathf.Clamp(local.y * 2.2f, -0.7f, 1f) : Mathf.Clamp(local.y * 0.4f, -0.3f, 0.4f);
            input.yaw = aligned ? Mathf.Clamp(local.x * 0.25f, -0.4f, 0.4f) : 0f;
        }

        private float AngleTo(Vector3 worldPos) =>
            Vector3.Angle(self.transform.forward, worldPos - self.transform.position) * Mathf.Deg2Rad;
    }
}
