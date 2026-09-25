// NéoScol — lanceur du paquet portable (Windows, sans Docker).
//
// Démarre, depuis le dossier du paquet :
//   1. PostgreSQL embarqué (données dans ./donnees), initialisé au premier lancement
//      avec le schéma NéoScol et les données de démonstration ;
//   2. le serveur d'authentification (GoTrue) et l'API REST (PostgREST) ;
//   3. une passerelle locale (/auth/v1 et /rest/v1), comme Supabase ;
//   4. l'application NéoScol, puis ouvre le navigateur.
// La base, l'authentification et l'API n'écoutent que sur cet ordinateur (127.0.0.1).
// L'application écoute sur le réseau local : tout appareil connecté au même Wi-Fi
// (téléphone, tablette, autre ordinateur) l'ouvre via http://<adresse du poste>:3000.
//
// Usage : DEMARRER.cmd (ou « node demarrer.mjs ») ; « node demarrer.mjs --reinitialiser »
// remet les données de démonstration à zéro.

import { spawn, spawnSync } from "node:child_process";
import { closeSync, createWriteStream, existsSync, mkdirSync, openSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import pg from "pg";

const ROOT = dirname(fileURLToPath(import.meta.url));
const WIN = process.platform === "win32";
const EXE = WIN ? ".exe" : "";
const RUNTIME = join(ROOT, "runtime");
const PG_BIN = join(RUNTIME, "postgres", "bin");
const DATA = join(ROOT, "donnees");
const PGDATA = join(DATA, "postgres");
const LOGS = join(DATA, "journaux");

const PORTS = { app: 3000, db: 55432, auth: 55999, rest: 55301, gateway: 55321 };
const CONFIG = JSON.parse(readFileSync(join(ROOT, "config.json"), "utf8"));
const DB_NAME = "neoscol";

const children = [];
let stopping = false;

const say = (m) => console.log(`\n\x1b[1;36m> ${m}\x1b[0m`);
const info = (m) => console.log(`  ${m}`);
function fail(message) {
  console.error(`\n\x1b[1;31mERREUR : ${message}\x1b[0m`);
  console.error(`  Les journaux détaillés sont dans : ${LOGS}`);
  shutdown(1);
}

function run(bin, args, options = {}) {
  const result = spawnSync(bin, args, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  return result;
}

function portFree(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => server.close(() => resolve(true)));
    server.listen(port, host);
  });
}

function httpOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => {
      res.resume();
      resolve(res.statusCode !== undefined && res.statusCode < 500);
    });
    req.on("error", () => resolve(false));
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
  });
}

async function waitFor(check, label, seconds = 90) {
  for (let i = 0; i < seconds * 2; i++) {
    if (await check()) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  fail(`${label} ne répond pas.`);
}

function start(name, bin, args, env) {
  const log = createWriteStream(join(LOGS, `${name}.log`), { flags: "a" });
  const child = spawn(bin, args, { env: { ...process.env, ...env }, cwd: dirname(bin), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.pipe(log);
  child.stderr.pipe(log);
  child.on("exit", (code) => {
    if (!stopping) fail(`${name} s'est arrêté (code ${code}).`);
  });
  children.push(child);
  return child;
}

// ---------------------------------------------------------------------------
// PostgreSQL
// ---------------------------------------------------------------------------
const pgCtl = (args) => run(join(PG_BIN, `pg_ctl${EXE}`), args);
const pgRunning = () => existsSync(join(PGDATA, "PG_VERSION")) && pgCtl(["status", "-D", PGDATA]).status === 0;

async function startPostgres() {
  const fresh = !existsSync(join(PGDATA, "PG_VERSION"));
  if (fresh) {
    say("Première installation : création de la base de données (1 à 2 minutes)");
    mkdirSync(DATA, { recursive: true });
    const init = run(join(PG_BIN, `initdb${EXE}`), ["-D", PGDATA, "-U", "postgres", "-A", "trust", "-E", "UTF8", "--no-locale"]);
    if (init.status !== 0) fail(`initialisation de PostgreSQL impossible :\n${init.stderr || init.stdout}`);
  }
  if (!pgRunning()) {
    if (!(await portFree(PORTS.db))) fail(`le port ${PORTS.db} est déjà utilisé par un autre programme.`);
    // Sorties vers un fichier (pas de tube) : sous Windows, le serveur hériterait du tube
    // et bloquerait le lanceur jusqu'à son arrêt.
    const logFile = join(LOGS, "pg_ctl.log");
    const fd = openSync(logFile, "a");
    const res = run(join(PG_BIN, `pg_ctl${EXE}`), ["start", "-D", PGDATA, "-w", "-t", "120", "-l", join(LOGS, "postgres.log"), "-o", `-p ${PORTS.db} -h 127.0.0.1`], {
      stdio: ["ignore", fd, fd],
    });
    closeSync(fd);
    if (res.status !== 0) fail(`PostgreSQL n'a pas démarré :\n${readFileSync(logFile, "utf8").slice(-2000)}`);
  }
  return fresh;
}

async function sql(database, text) {
  const client = new pg.Client({ host: "127.0.0.1", port: PORTS.db, user: "postgres", database });
  await client.connect();
  try {
    await client.query(text);
  } finally {
    await client.end();
  }
}

async function installSchema() {
  info("Création de la base NéoScol…");
  await sql("postgres", `create database ${DB_NAME}`);
  await sql(
    DB_NAME,
    `create role supabase_auth_admin login superuser password 'postgres';
     create schema auth authorization supabase_auth_admin;
     create schema extensions;`,
  );
  info("Tables d'authentification…");
  const migrate = run(join(RUNTIME, "auth", `auth${EXE}`), ["migrate"], { cwd: join(RUNTIME, "auth"), env: { ...process.env, ...authEnv() } });
  if (migrate.status !== 0) fail(`migration de l'authentification impossible :\n${migrate.stderr || migrate.stdout}`);
  const dir = join(ROOT, "base");
  await sql(DB_NAME, readFileSync(join(dir, "supabase-stub.sql"), "utf8"));
  const files = readdirSync(join(dir, "migrations")).filter((f) => f.endsWith(".sql")).sort();
  for (const [i, file] of files.entries()) {
    process.stdout.write(`\r  Schéma NéoScol : ${i + 1}/${files.length}   `);
    await sql(DB_NAME, readFileSync(join(dir, "migrations", file), "utf8"));
  }
  console.log("");
  info("Données de démonstration…");
  await sql(DB_NAME, readFileSync(join(dir, "seed.sql"), "utf8"));
  writeFileSync(join(DATA, "installation-terminee.txt"), new Date().toISOString());
}

// ---------------------------------------------------------------------------
// Authentification, API REST, passerelle
// ---------------------------------------------------------------------------
function authEnv() {
  return {
    GOTRUE_DB_DRIVER: "postgres",
    DATABASE_URL: `postgres://supabase_auth_admin:postgres@127.0.0.1:${PORTS.db}/${DB_NAME}?search_path=auth&sslmode=disable`,
    GOTRUE_DB_MIGRATIONS_PATH: join(RUNTIME, "auth", "migrations"),
    GOTRUE_API_HOST: "127.0.0.1",
    PORT: String(PORTS.auth),
    API_EXTERNAL_URL: `http://127.0.0.1:${PORTS.gateway}/auth/v1`,
    GOTRUE_SITE_URL: `http://localhost:${PORTS.app}`,
    GOTRUE_URI_ALLOW_LIST: `http://localhost:${PORTS.app}/**`,
    GOTRUE_JWT_SECRET: CONFIG.jwtSecret,
    GOTRUE_JWT_EXP: "3600",
    GOTRUE_JWT_AUD: "authenticated",
    GOTRUE_JWT_DEFAULT_GROUP_NAME: "authenticated",
    GOTRUE_JWT_ADMIN_ROLES: "service_role",
    GOTRUE_DISABLE_SIGNUP: "true",
    GOTRUE_EXTERNAL_EMAIL_ENABLED: "true",
    GOTRUE_MAILER_AUTOCONFIRM: "true",
    GOTRUE_EXTERNAL_PHONE_ENABLED: "true",
    GOTRUE_SMS_AUTOCONFIRM: "false",
    // Aucun SMS n'est envoyé : seuls les numéros de démonstration ont un code fixe.
    GOTRUE_SMS_PROVIDER: "twilio",
    GOTRUE_SMS_TWILIO_ACCOUNT_SID: "ACdemo",
    GOTRUE_SMS_TWILIO_AUTH_TOKEN: "demo",
    GOTRUE_SMS_TWILIO_MESSAGE_SERVICE_SID: "MGdemo",
    GOTRUE_SMS_OTP_EXP: "600",
    GOTRUE_SMS_OTP_LENGTH: "6",
    GOTRUE_SMS_TEST_OTP: "2250700000001:123456",
    GOTRUE_SMS_MAX_FREQUENCY: "1s",
    GOTRUE_RATE_LIMIT_SMS_SENT: "1000",
    GOTRUE_LOG_LEVEL: "warn",
  };
}

function writeRestConfig() {
  const file = join(DATA, "postgrest.conf");
  writeFileSync(
    file,
    [
      `db-uri = "postgres://postgres@127.0.0.1:${PORTS.db}/${DB_NAME}?sslmode=disable"`,
      `db-schemas = "public"`,
      `db-anon-role = "anon"`,
      `jwt-secret = "${CONFIG.jwtSecret}"`,
      `server-host = "127.0.0.1"`,
      `server-port = ${PORTS.rest}`,
      `log-level = "warn"`,
      "",
    ].join("\n"),
  );
  return file;
}

function startGateway() {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = req.url ?? "/";
      const target = url.startsWith("/auth/v1") ? ["/auth/v1", PORTS.auth] : url.startsWith("/rest/v1") ? ["/rest/v1", PORTS.rest] : null;
      if (!target) {
        res.writeHead(404);
        return res.end();
      }
      const proxied = http.request(
        { host: "127.0.0.1", port: target[1], path: url.slice(target[0].length) || "/", method: req.method, headers: req.headers },
        (upstream) => {
          res.writeHead(upstream.statusCode ?? 502, upstream.headers);
          upstream.pipe(res);
        },
      );
      proxied.on("error", () => {
        res.writeHead(502);
        res.end();
      });
      req.pipe(proxied);
    });
    server.once("error", reject);
    server.listen(PORTS.gateway, "127.0.0.1", () => resolve(server));
  });
}

// ---------------------------------------------------------------------------
// Arrêt propre
// ---------------------------------------------------------------------------
function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  console.log("\nArrêt de NéoScol…");
  for (const child of children) {
    try {
      child.kill();
    } catch {
      // déjà arrêté
    }
  }
  if (existsSync(join(PGDATA, "PG_VERSION"))) {
    try {
      pgCtl(["stop", "-D", PGDATA, "-m", "fast", "-w"]);
    } catch {
      // déjà arrêté
    }
  }
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

// ---------------------------------------------------------------------------
// Programme principal
// ---------------------------------------------------------------------------
async function main() {
  const [major, minor] = process.versions.node.split(".").map(Number);
  if (major < 20 || (major === 20 && minor < 9)) {
    console.error(`Node.js ${process.version} est trop ancien : installez la version 20.9 ou plus (https://nodejs.org).`);
    process.exit(1);
  }
  console.log("\x1b[1;34m\n  NéoScol — démonstration locale\x1b[0m");

  // Paquet livré en plusieurs .zip à extraire dans le même dossier.
  const parts = [
    [join(ROOT, "app", "server.js"), "NeoScol-1-application.zip"],
    [join(PG_BIN, `postgres${EXE}`), "NeoScol-2-postgresql.zip"],
    [join(RUNTIME, "auth", `auth${EXE}`), "NeoScol-3-services.zip"],
    [join(RUNTIME, "postgrest", `postgrest${EXE}`), "NeoScol-3-services.zip"],
  ];
  const missing = [...new Set(parts.filter(([file]) => !existsSync(file)).map(([, zip]) => zip))];
  if (missing.length) {
    console.error(`\nERREUR : il manque ${missing.join(" et ")}.`);
    console.error(`  Extrayez chaque fichier .zip dans le MÊME dossier (celui qui contient ce fichier) :\n  ${ROOT}`);
    process.exit(1);
  }

  if (process.argv.includes("--reinitialiser")) {
    say("Remise à zéro des données de démonstration");
    if (pgRunning()) pgCtl(["stop", "-D", PGDATA, "-m", "fast", "-w"]);
    rmSync(DATA, { recursive: true, force: true });
  }
  mkdirSync(LOGS, { recursive: true });

  for (const [name, port] of [["NéoScol", PORTS.app], ["authentification", PORTS.auth], ["API", PORTS.rest], ["passerelle", PORTS.gateway]]) {
    if (!(await portFree(port))) fail(`le port ${port} (${name}) est déjà utilisé : fermez l'autre fenêtre NéoScol ou le programme qui l'utilise.`);
  }

  say("Démarrage de la base de données");
  const fresh = await startPostgres();
  if (fresh || !existsSync(join(DATA, "installation-terminee.txt"))) {
    if (!fresh) {
      // Installation interrompue : on repart d'une base vierge.
      await sql("postgres", `drop database if exists ${DB_NAME} with (force)`);
      await sql("postgres", "drop role if exists supabase_auth_admin").catch(() => {});
    }
    await installSchema();
  }

  say("Démarrage de l'authentification et de l'API");
  start("authentification", join(RUNTIME, "auth", `auth${EXE}`), [], authEnv());
  start("api", join(RUNTIME, "postgrest", `postgrest${EXE}`), [writeRestConfig()], {});
  await startGateway();
  await waitFor(() => httpOk(`http://127.0.0.1:${PORTS.gateway}/auth/v1/health`), "L'authentification");
  await waitFor(() => httpOk(`http://127.0.0.1:${PORTS.gateway}/rest/v1/`), "L'API");

  // Adresses du poste sur le réseau local (Wi-Fi / Ethernet), privées uniquement.
  const lanAddresses = Object.values(os.networkInterfaces())
    .flat()
    .filter((a) => a && a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address))
    .map((a) => a.address)
    .sort((a, b) => Number(b.startsWith("192.168.")) - Number(a.startsWith("192.168.")));
  const lanUrl = lanAddresses[0] ? `http://${lanAddresses[0]}:${PORTS.app}` : "";

  say("Démarrage de l'application");
  start("application", process.execPath, [join(ROOT, "app", "server.js")], {
    NODE_ENV: "production",
    PORT: String(PORTS.app),
    // Toutes les interfaces : accessible depuis les appareils du même réseau local.
    HOSTNAME: "0.0.0.0",
    NEOSCOL_LAN_URL: lanUrl,
    SUPABASE_SERVICE_ROLE_KEY: CONFIG.serviceKey,
    CRON_SECRET: CONFIG.cronSecret,
    NEOSCOL_DEMO_MODE: "1",
    // Abonnements : paiement simulé (poste local de démonstration, aucun argent réel).
    PAYMENT_PROVIDER: process.env.PAYMENT_PROVIDER ?? "simulation",
    PAYMENT_ALLOW_SIMULATION: "1",
    NEXT_TELEMETRY_DISABLED: "1",
  });
  const url = `http://localhost:${PORTS.app}`;
  await waitFor(() => httpOk(`${url}/connexion`), "L'application", 120);

  console.log(`\n\x1b[1;32m  NéoScol est prêt : ${url}\x1b[0m`);
  if (lanAddresses.length) {
    console.log(`\x1b[1;36m  Sur les autres appareils du même Wi-Fi (téléphone, tablette, PC) :\x1b[0m`);
    for (const address of lanAddresses) console.log(`\x1b[1;36m      http://${address}:${PORTS.app}\x1b[0m`);
    info("Si les autres appareils n'y accèdent pas : double-cliquez sur AUTORISER-WIFI.cmd (pare-feu Windows).");
  } else {
    info("Aucun réseau local détecté : connectez ce poste au Wi-Fi pour l'ouvrir depuis d'autres appareils.");
  }
  info("Choisissez un profil dans « Accès rapide — démonstration » sur la page de connexion.");
  info("Mot de passe commun : NeoScol-Demo-2026!   ·   Code SMS parent : 123456");
  info("Pour arrêter : fermez cette fenêtre ou appuyez sur Ctrl + C.");
  if (!process.argv.includes("--sans-navigateur")) {
    if (WIN) spawn("cmd", ["/c", "start", "", url], { detached: true, stdio: "ignore", windowsHide: true }).unref();
    else if (process.platform === "darwin") spawn("open", [url], { detached: true, stdio: "ignore" }).unref();
    else spawn("xdg-open", [url], { detached: true, stdio: "ignore" }).on("error", () => {}).unref();
  }
}

main().catch((error) => fail(error?.message ?? String(error)));
