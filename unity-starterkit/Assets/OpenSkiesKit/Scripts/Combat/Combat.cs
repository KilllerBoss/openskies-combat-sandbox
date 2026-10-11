// ============================================================================
//  Combat — Waffen, Projektile, Lenkrakete, Schaden (Unity-Version).
//  Kompakter als das Web-Gegenstück, aber dieselben Kernideen:
//    · Projektile = gepoolte GameObjects (kein Instantiate im Dauerfeuer)
//    · Lenkrakete = Proportionale Navigation a = N·Vc·ω
//    · Schaden = eine zentrale Stelle (Panzerung, Abschuss, Events)
//  ============================================================================
using System.Collections.Generic;
using UnityEngine;

namespace OpenSkiesKit.Combat
{
    // ---------------------------------------------------------------- Weapon --
    public class WeaponSystem
    {
        public float Ammo, LockProgress;
        public int MissilesLeft;
        public bool Locked;
        public Physics.Vehicle LockTarget;

        private readonly Core.VehicleSpec spec;
        private readonly Physics.Vehicle owner;
        private float cannonCd, missileCd;

        public WeaponSystem(Physics.Vehicle owner, Core.VehicleSpec spec)
        {
            this.owner = owner;
            this.spec = spec;
            Ammo = spec.cannon.ammo;
            MissilesLeft = spec.missiles != null ? spec.missiles.count : 0;
        }

        public void Tick(float dt, Core.ControlInput input)
        {
            cannonCd -= dt;
            missileCd -= dt;
            Ammo = Mathf.Min(spec.cannon.ammo, Ammo + spec.cannon.regenPerSec * dt);

            // --- Lock-On: Ziel im Kegel halten ---
            var m = spec.missiles;
            if (m != null)
            {
                Physics.Vehicle best = null;
                float bestCos = Mathf.Cos(m.lockConeDeg * Mathf.Deg2Rad);
                foreach (var e in DamageSystem.EnemiesOf(owner))
                {
                    if (!e.alive) continue;
                    Vector3 to = e.transform.position - owner.transform.position;
                    if (to.magnitude > m.lockRange) continue;
                    float cos = Vector3.Dot(to.normalized, owner.transform.forward);
                    if (cos > bestCos) { bestCos = cos; best = e; }
                }
                if (best != LockTarget) { LockTarget = best; LockProgress = 0f; }
                if (LockTarget != null)
                {
                    Vector3 to = LockTarget.transform.position - owner.transform.position;
                    if (Vector3.Dot(to.normalized, owner.transform.forward) > Mathf.Cos(m.lockConeDeg * 0.7f))
                        LockProgress = Mathf.Min(1f, LockProgress + dt / m.lockTime);
                }
                Locked = LockProgress >= 1f;

                if (input.missile && Locked && MissilesLeft > 0 && missileCd <= 0f)
                {
                    MissilesLeft--;
                    missileCd = m.cooldown;
                    DamageSystem.SpawnMissile(owner, LockTarget, m);
                }
            }

            // --- Bordkanone ---
            if (input.fire && cannonCd <= 0f && Ammo >= 1f)
            {
                cannonCd = 1f / spec.cannon.rate;
                Ammo -= 1f;
                Vector3 dir = owner.transform.forward;
                dir = Quaternion.Euler(
                    Random.Range(-1f, 1f) * spec.cannon.spreadDeg,
                    Random.Range(-1f, 1f) * spec.cannon.spreadDeg, 0f) * dir;
                DamageSystem.SpawnBullet(owner, spec.cannon, dir);
            }
        }
    }

    // ------------------------------------------------------------- Projectile --
    /// <summary>Ein Projektil — verwaltet von DamageSystem (Pool!).</summary>
    public class Projectile : MonoBehaviour
    {
        public Vector3 Velocity;
        public float Damage, Life;
        public Physics.Vehicle Owner;

        private void FixedUpdate()
        {
            Life -= Time.fixedDeltaTime;
            Velocity.y -= 2.2f * Time.fixedDeltaTime; // leichter ballistischer Fall
            transform.position += Velocity * Time.fixedDeltaTime;
            transform.rotation = Quaternion.LookRotation(Velocity);

            if (Life <= 0f ||
                Physics.Raycast(new Ray(transform.position - Velocity.normalized * 2f, Velocity.normalized),
                    out RaycastHit hit, Velocity.magnitude * Time.fixedDeltaTime + 2f))
            {
                var veh = hit.collider != null ? hit.collider.GetComponentInParent<Physics.Vehicle>() : null;
                if (veh != null && veh != Owner && veh.alive)
                    DamageSystem.Apply(veh, Damage, Owner);
                DamageSystem.ReturnBullet(this);
            }
        }
    }

    // ---------------------------------------------------------------- Missile --
    public class HomingMissile : MonoBehaviour
    {
        public Physics.Vehicle Owner, Target;
        public Core.MissileSpec Spec;
        public Vector3 Velocity;
        public float Burn, Life = 12f;

        private void FixedUpdate()
        {
            float dt = Time.fixedDeltaTime;
            Life -= dt;
            if (Life <= 0f) { DamageSystem.ReturnMissile(this); return; }

            if (Burn > 0f)
            {
                Burn -= dt;
                if (Velocity.magnitude < Spec.speed) Velocity += Velocity.normalized * (Spec.accel * dt);
            }

            // --- PROPORTIONALE NAVIGATION: a = N · Vc · ω ---
            if (Target != null && Target.alive)
            {
                Vector3 r = Target.transform.position - transform.position;
                Vector3 vRel = Velocity - Target.GetComponent<Rigidbody>().linearVelocity;
                float range = r.magnitude;
                if (range > 0.001f)
                {
                    Vector3 omega = Vector3.Cross(r, vRel) / (range * range); // LOS-Rate
                    float vc = -Vector3.Dot(r, vRel) / range;                   // Annäherung
                    Vector3 acc = omega * (Mathf.Max(0f, vc) * Spec.navConstant);
                    float aMax = Velocity.magnitude * Spec.turnRate;             // Limit!
                    if (acc.sqrMagnitude > aMax * aMax) acc = acc.normalized * aMax;
                    Velocity += acc * dt;
                }
                if (range < 14f) // Annäherungszünder
                {
                    DamageSystem.Apply(Target, Spec.damage, Owner);
                    DamageSystem.Explode(transform.position);
                    DamageSystem.ReturnMissile(this);
                    return;
                }
            }

            transform.position += Velocity * dt;
            transform.rotation = Quaternion.LookRotation(Velocity);

            if (transform.position.y <= Physics.FlightModel.SampleGround(transform.position))
            {
                DamageSystem.Explode(transform.position);
                DamageSystem.ReturnMissile(this);
            }
        }
    }

    // ----------------------------------------------------------------- Damage --
    /// <summary>
    /// Statische zentrale Stelle für Schaden, Abschüsse, Projektil-Pools.
    /// (Im Web-Prototyp ist das die Engine + DamageSystem — hier zusammengezogen,
    /// damit das Kit übersichtlich bleibt.)
    /// </summary>
    public static class DamageSystem
    {
        public static int Score, Kills;
        public static System.Action<Physics.Vehicle, Physics.Vehicle> OnKill;

        private static readonly Stack<Projectile> bulletPool = new();
        private static readonly Stack<HomingMissile> missilePool = new();
        private static readonly List<Physics.Vehicle> all = new();
        private static Transform poolRoot;

        public static void Register(Physics.Vehicle v) => all.Add(v);
        public static void Unregister(Physics.Vehicle v) => all.Remove(v);
        public static IReadOnlyList<Physics.Vehicle> All => all;

        public static List<Physics.Vehicle> EnemiesOf(Physics.Vehicle v)
        {
            // FFA: Spieler gegen alle KI, jede KI gegen den Spieler
            var list = new List<Physics.Vehicle>();
            foreach (var o in all)
                if (o != v && o.alive && o.IsPlayer != v.IsPlayer) list.Add(o);
            return list;
        }

        public static void Apply(Physics.Vehicle target, float amount, Physics.Vehicle attacker)
        {
            if (!target.alive) return;
            float armor = ArmorOf(target);
            target.hp -= amount * (1f - armor);
            if (target.hp <= 0f) Kill(target, attacker);
        }

        public static void ReportCrash(Physics.Vehicle v) => Kill(v, null);

        private static void Kill(Physics.Vehicle target, Physics.Vehicle attacker)
        {
            if (!target.alive) return;
            target.alive = false;
            Explode(target.transform.position);
            OnKill?.Invoke(target, attacker);
            if (attacker != null && attacker.IsPlayer)
            {
                Score += target.Spec.vehicleClass == "jet" ? 100 : target.Spec.vehicleClass == "ship" ? 150 : 120;
                Kills++;
            }
            if (target.IsPlayer)
                Core.GameManager.Instance.RespawnPlayer(2.5f);
            else
                Object.Destroy(target.gameObject, 0.1f); // KI: weg ( respawn über GameManager )
        }

        private static float ArmorOf(Physics.Vehicle v) => v.Spec.vehicleClass switch
        {
            "jet" => v.Spec.jetPhysics.armor,
            "ship" => v.Spec.shipPhysics.armor,
            _ => v.Spec.tankPhysics.armor,
        };

        // ------------------------------------------------------------ Pools --
        public static void SpawnBullet(Physics.Vehicle owner, Core.CannonSpec c, Vector3 dir)
        {
            var p = bulletPool.Count > 0 ? bulletPool.Pop() : CreateBullet();
            p.Owner = owner;
            p.Damage = c.damage;
            p.Life = c.range / c.muzzleVelocity;
            p.Velocity = dir * c.muzzleVelocity + owner.GetComponent<Rigidbody>().linearVelocity * 0.5f;
            p.transform.position = owner.transform.position + owner.transform.forward * 8f;
            p.gameObject.SetActive(true);
        }

        public static void SpawnMissile(Physics.Vehicle owner, Physics.Vehicle target, Core.MissileSpec spec)
        {
            var m = missilePool.Count > 0 ? missilePool.Pop() : CreateMissile();
            m.Owner = owner;
            m.Target = target;
            m.Spec = spec;
            m.Burn = spec.burnTime;
            m.Life = 12f;
            m.Velocity = owner.transform.forward * (owner.Speed + 40f);
            m.transform.position = owner.transform.position + owner.transform.forward * 6f;
            m.gameObject.SetActive(true);
        }

        public static void ReturnBullet(Projectile p) { p.gameObject.SetActive(false); bulletPool.Push(p); }
        public static void ReturnMissile(HomingMissile m) { m.gameObject.SetActive(false); missilePool.Push(m); }

        private static Projectile CreateBullet()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.transform.localScale = new Vector3(0.2f, 0.2f, 2.5f);
            go.GetComponent<Renderer>().material.color = new Color(1f, 0.82f, 0.45f);
            Object.Destroy(go.GetComponent<Collider>()); // Projektil kollidiert per Raycast
            EnsurePoolRoot(go);
            return go.AddComponent<Projectile>();
        }

        private static HomingMissile CreateMissile()
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            go.transform.localScale = new Vector3(0.4f, 1.6f, 0.4f);
            Object.Destroy(go.GetComponent<Collider>());
            EnsurePoolRoot(go);
            return go.AddComponent<HomingMissile>();
        }

        private static void EnsurePoolRoot(GameObject go)
        {
            if (poolRoot == null)
            {
                var pr = new GameObject("[OpenSkies Pool]");
                Object.DontDestroyOnLoad(pr);
                poolRoot = pr.transform;
            }
            go.transform.parent = poolRoot;
        }

        public static void Explode(Vector3 pos)
        {
            // Einfacher Partikel-Burst — im echten Projekt: ParticleSystem-Prefab
            Debug.Log($"[Explosion] bei {pos}");
        }
    }
}
