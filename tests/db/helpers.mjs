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
