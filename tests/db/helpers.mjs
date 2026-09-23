// Utilitaires de test : exécute des requêtes « en tant que » un utilisateur
// Supabase (rôle authenticated + claims JWT), dans une transaction annulée.
import pg from "pg";

export const ORG_DEMO = "10000000-0000-4000-a000-000000000001";
export const ORG_DEMOF = "10000000-0000-4000-a000-000000000002";
export const USERS = {
  superadmin: "00000000-0000-4000-a000-000000000001",
  admin: "00000000-0000-4000-a000-000000000002",
  director: "00000000-0000-4000-a000-000000000003",
  secretary: "00000000-0000-4000-a000-000000000004",
  accountant: "00000000-0000-4000-a000-000000000005",
  teacher: "00000000-0000-4000-a000-000000000006",
  teacher2: "00000000-0000-4000-a000-000000000007",
  parent: "00000000-0000-4000-a000-000000000008",
  student: "00000000-0000-4000-a000-000000000009",
  otherOrgAdmin: "00000000-0000-4000-a000-000000000010",
  kiosk: "00000000-0000-4000-a000-000000000011",
};

export const pool = new pg.Pool({
  host: process.env.PGHOST ?? "localhost",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "neoscol_test",
  max: 4,
});

/** Exécute fn(query) avec l'identité donnée ; tout est annulé à la fin. */
export async function as(userId, fn) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    if (userId === "anon") {
      await client.query("set local role anon");
      await client.query(`select set_config('request.jwt.claims', '{"role":"anon"}', true)`);
    } else if (userId) {
      await client.query("set local role authenticated");
      await client.query("select set_config('request.jwt.claims', $1, true)", [
        JSON.stringify({ sub: userId, role: "authenticated" }),
      ]);
    }
    // Chaque requête dans un savepoint : une erreur attendue n'interrompt pas la transaction.
    const query = async (sql, params) => {
      await client.query("savepoint q");
      try {
        const result = await client.query(sql, params);
        await client.query("release savepoint q");
        return result.rows;
      } catch (error) {
        await client.query("rollback to savepoint q");
        throw error;
      }
    };
    return await fn(query);
  } finally {
    await client.query("rollback").catch(() => {});
    client.release();
  }
}

/** Vérifie qu'une requête échoue ; renvoie le message d'erreur. */
export async function rejects(promise) {
  try {
    await promise;
  } catch (error) {
    return error.message;
  }
  throw new Error("La requête aurait dû échouer.");
}

/** Change d'identité dans la transaction courante (null = système). */
export async function switchTo(q, userId) {
  if (userId === null) {
    await q("reset role");
    await q("select set_config('request.jwt.claims', '', true)");
    return;
  }
  await q("set local role authenticated");
  await q("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: userId, role: "authenticated" })]);
}

/**
 * Crée (en contexte système) un cours de l'enseignant qui a lieu MAINTENANT :
 * les créneaux du jour de la classe et de l'enseignant sont retirés pour
 * éviter les chevauchements. Renvoie { slotId, classId, today }.
 */
export async function lessonNow(q, { teacherUser, className, subjectCode }) {
  const [info] = await q(
    `select cs.id as class_subject_id, cs.class_id, cs.teacher_id, c.academic_year_id, c.organization_id,
            (now() at time zone o.timezone)::date as today,
            extract(isodow from (now() at time zone o.timezone))::int as weekday,
            greatest((now() at time zone o.timezone)::time - interval '10 minutes', time '00:00')::time as starts_at,
            least((now() at time zone o.timezone)::time + interval '50 minutes', time '23:59:59')::time as ends_at
     from class_subjects cs join classes c on c.id = cs.class_id join subjects s on s.id = cs.subject_id
     join organizations o on o.id = c.organization_id
     join staff_members st on st.id = cs.teacher_id
     where c.name = $1 and s.code = $2 and st.user_id = $3`,
    [className, subjectCode, teacherUser],
  );
  if (!info) throw new Error("Affectation introuvable pour le cours de test.");
  await q("delete from timetable_slots where weekday = $1 and (class_id = $2 or teacher_id = $3)", [
    info.weekday, info.class_id, info.teacher_id,
  ]);
  const [slot] = await q(
    `insert into timetable_slots (organization_id, academic_year_id, class_id, class_subject_id, teacher_id, weekday, starts_at, ends_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
    [info.organization_id, info.academic_year_id, info.class_id, info.class_subject_id, info.teacher_id, info.weekday, info.starts_at, info.ends_at],
  );
  return { slotId: slot.id, classId: info.class_id, today: info.today, teacherId: info.teacher_id };
}

/** Jeton du badge actif d'un membre du personnel (contexte système). */
export async function badgeToken(q, userId) {
  const [row] = await q(
    "select b.token from staff_badges b join staff_members s on s.id = b.staff_id where s.user_id = $1 and b.status = 'active'",
    [userId],
  );
  return row?.token;
}
