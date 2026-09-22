// Génère src/types/database.ts (format compatible `supabase gen types`) depuis
// le catalogue PostgreSQL d'une base où les migrations ont été appliquées.
// Usage : node scripts/db/gen-types.mjs   (variables PG* ; base par défaut neoscol_test)
// Sur un projet Supabase lié, `supabase gen types typescript` produit le même format.
import { writeFileSync } from "node:fs";
import pg from "pg";

const client = new pg.Client({
  host: process.env.PGHOST ?? "localhost",
  user: process.env.PGUSER ?? "postgres",
  password: process.env.PGPASSWORD ?? "postgres",
  database: process.env.PGDATABASE ?? "neoscol_test",
});
await client.connect();
const q = async (sql, params) => (await client.query(sql, params)).rows;

const enums = await q(`
  select t.typname as name, array_agg(e.enumlabel::text order by e.enumsortorder) as labels
  from pg_type t join pg_enum e on e.enumtypid = t.oid
  join pg_namespace n on n.oid = t.typnamespace
  where n.nspname = 'public' group by t.typname order by t.typname`);
const enumNames = new Set(enums.map((e) => e.name));

const scalar = (udt) => {
  if (enumNames.has(udt)) return `Database["public"]["Enums"]["${udt}"]`;
  switch (udt) {
    case "int2": case "int4": case "int8": case "float4": case "float8": case "numeric": case "oid":
      return "number";
    case "bool": return "boolean";
    case "json": case "jsonb": return "Json";
    case "void": return "undefined";
    default: return "string";
  }
};
const tsType = (udt) => (udt.startsWith("_") ? `${scalar(udt.slice(1))}[]` : scalar(udt));

const columns = await q(`
  select c.relname as table, c.relkind as kind, a.attname as name, t.typname as udt,
         not a.attnotnull as nullable, a.atthasdef as has_default,
         a.attidentity <> '' as identity, a.attgenerated <> '' as generated
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_attribute a on a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  where n.nspname = 'public' and c.relkind in ('r', 'v')
  order by c.relname, a.attname`);

const fks = await q(`
  select con.conname as name, src.relname as table, dst.relname as target,
         array(select a.attname::text from unnest(con.conkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.conrelid and a.attnum = k.n order by k.i) as columns,
         array(select a.attname::text from unnest(con.confkey) with ordinality k(n, i)
               join pg_attribute a on a.attrelid = con.confrelid and a.attnum = k.n order by k.i) as target_columns,
         exists (
           select 1 from pg_constraint u
           where u.conrelid = con.conrelid and u.contype in ('p', 'u')
             and (select array_agg(x order by x) from unnest(u.conkey) x) = (select array_agg(x order by x) from unnest(con.conkey) x)
         ) as one_to_one
  from pg_constraint con
  join pg_class src on src.oid = con.conrelid
  join pg_class dst on dst.oid = con.confrelid
  join pg_namespace n on n.oid = src.relnamespace
  join pg_namespace dn on dn.oid = dst.relnamespace
  where con.contype = 'f' and n.nspname = 'public' and dn.nspname = 'public'
  order by src.relname, con.conname`);

const functions = await q(`
  select p.proname as name,
         coalesce(p.proargnames, '{}') as arg_names,
         array(select t.typname::text from unnest(p.proargtypes) with ordinality x(oid, i) join pg_type t on t.oid = x.oid order by x.i) as arg_types,
         p.pronargdefaults as n_defaults, p.pronargs as n_args,
         rt.typname as return_type, p.proretset as returns_set,
         array(select a.name from unnest(p.proargnames, p.proargmodes) with ordinality a(name, mode, i) where a.mode = 't' order by a.i) as out_names,
         array(select t.typname::text from unnest(p.proallargtypes, p.proargmodes) with ordinality a(oid, mode, i)
               join pg_type t on t.oid = a.oid where a.mode = 't' order by a.i) as out_types
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  join pg_type rt on rt.oid = p.prorettype
  where n.nspname = 'public' and rt.typname <> 'trigger' and p.prokind = 'f'
  order by p.proname`);

const group = (rows, key) =>
  rows.reduce((acc, row) => ((acc[row[key]] ??= []).push(row), acc), {});

const byTable = group(columns, "table");
const fkByTable = group(fks, "table");
const indent = (s, n) => s.split("\n").map((l) => " ".repeat(n) + l).join("\n");

const relationships = (table) =>
  (fkByTable[table] ?? [])
    .map(
      (fk) => `{
  foreignKeyName: "${fk.name}"
  columns: [${fk.columns.map((c) => `"${c}"`).join(", ")}]
  isOneToOne: ${fk.one_to_one}
  referencedRelation: "${fk.target}"
  referencedColumns: [${fk.target_columns.map((c) => `"${c}"`).join(", ")}]
}`,
    )
    .join(",\n");

const tableBlock = (name, cols) => {
  const row = cols.map((c) => `${c.name}: ${tsType(c.udt)}${c.nullable ? " | null" : ""}`).join("\n");
  const insert = cols
    .map((c) =>
      c.generated
        ? `${c.name}?: never`
        : `${c.name}${c.nullable || c.has_default || c.identity ? "?" : ""}: ${tsType(c.udt)}${c.nullable ? " | null" : ""}`,
    )
    .join("\n");
  const update = cols
    .map((c) => (c.generated ? `${c.name}?: never` : `${c.name}?: ${tsType(c.udt)}${c.nullable ? " | null" : ""}`))
    .join("\n");
  return `${name}: {
  Row: {
${indent(row, 4)}
  }
  Insert: {
${indent(insert, 4)}
  }
  Update: {
${indent(update, 4)}
  }
  Relationships: [
${indent(relationships(name), 4)}
  ]
}`;
};

const viewBlock = (name, cols) => `${name}: {
  Row: {
${indent(cols.map((c) => `${c.name}: ${tsType(c.udt)} | null`).join("\n"), 4)}
  }
  Relationships: []
}`;

const functionBlock = (fn) => {
  const required = fn.n_args - fn.n_defaults;
  const args = fn.arg_types
    .map((t, i) => `${fn.arg_names[i]}${i >= required ? "?" : ""}: ${tsType(t)}`)
    .join("\n");
  let returns;
  if (fn.out_names.length > 0) {
    returns = `{\n${indent(fn.out_names.map((n, i) => `${n}: ${tsType(fn.out_types[i])}`).join("\n"), 2)}\n}[]`;
  } else {
    returns = tsType(fn.return_type) + (fn.returns_set ? "[]" : "");
  }
  return `${fn.name}: {
  Args: ${args ? `{\n${indent(args, 4)}\n  }` : "never"}
  Returns: ${returns.replace(/\n/g, "\n  ")}
}`;
};

const tables = Object.entries(byTable).filter(([, cols]) => cols[0].kind === "r");
const views = Object.entries(byTable).filter(([, cols]) => cols[0].kind === "v");

const output = `// Fichier GÉNÉRÉ par scripts/db/gen-types.mjs — ne pas modifier à la main.
// Régénérer avec : npm run db:types

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "13.0.5"
  }
  public: {
    Tables: {
${indent(tables.map(([n, c]) => tableBlock(n, c)).join("\n"), 6)}
    }
    Views: {
${indent(views.map(([n, c]) => viewBlock(n, c)).join("\n"), 6)}
    }
    Functions: {
${indent(functions.map(functionBlock).join("\n"), 6)}
    }
    Enums: {
${indent(enums.map((e) => `${e.name}: ${e.labels.map((l) => `"${l}"`).join(" | ")}`).join("\n"), 6)}
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type PublicSchema = Database["public"]

export type Tables<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Row"]
export type TablesInsert<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Insert"]
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> = PublicSchema["Tables"][T]["Update"]
export type Views<T extends keyof PublicSchema["Views"]> = PublicSchema["Views"][T]["Row"]
export type Enums<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T]
`;

writeFileSync(new URL("../../src/types/database.ts", import.meta.url), output);
await client.end();
console.log(`Types générés : ${tables.length} tables, ${views.length} vues, ${functions.length} fonctions, ${enums.length} énumérations.`);
