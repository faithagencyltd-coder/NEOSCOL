// Génère capacitor.config.json et www/config.js à partir de l'environnement de construction.
//
//   NEOSCOOL_SERVER_URL     adresse du serveur NeoScool proposée par défaut (ex. https://app.exemple.com) ;
//                           vide : l'utilisateur scanne le QR code ou colle le lien de son établissement.
//   NEOSCOOL_ALLOWED_HOSTS  hôtes que l'application peut afficher, séparés par des virgules
//                           (défaut « * » : tout serveur NeoScool, y compris un serveur local en Wi-Fi).
//   NEOSCOOL_APP_VERSION    version affichée et ajoutée à l'agent utilisateur (défaut : package.json).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const version = process.env.NEOSCOOL_APP_VERSION || pkg.version;
const server = (process.env.NEOSCOOL_SERVER_URL || "").trim().replace(/\/+$/, "");
if (server && !/^https?:\/\/[^\s/]+$/.test(server)) throw new Error(`NEOSCOOL_SERVER_URL invalide : ${server}`);
const hosts = (process.env.NEOSCOOL_ALLOWED_HOSTS || "*").split(",").map((h) => h.trim()).filter(Boolean);

const config = {
  appId: "com.neoscool.app",
  appName: "NeoScool",
  webDir: "www",
  // Identifie l'application auprès du serveur (pas de site vitrine, bouton « Mes établissements »).
  appendUserAgent: `NeoScoolApp/${version}`,
  server: {
    androidScheme: "https",
    // Les portails sont servis par le serveur de chaque établissement (adresse choisie dans l'application).
    allowNavigation: hosts,
    errorPath: "hors-ligne.html",
  },
  android: {
    // Serveur local en Wi-Fi (http://192.168.x.x) joignable depuis les pages locales de l'application.
    allowMixedContent: true,
  },
  ios: {
    contentInset: "never",
    limitsNavigationsToAppBoundDomains: false,
  },
  plugins: {
    SplashScreen: { launchShowDuration: 700, launchAutoHide: true, backgroundColor: "#FFFFFF", showSpinner: false },
    SystemBars: { insetsHandling: "css", style: "LIGHT" },
  },
};
writeFileSync(join(root, "capacitor.config.json"), `${JSON.stringify(config, null, 2)}\n`);
writeFileSync(
  join(root, "www", "config.js"),
  `// Fichier généré par scripts/config.mjs — ne pas modifier à la main.\nwindow.NEOSCOOL_CONFIG = ${JSON.stringify({ version, defaultServer: server })};\n`,
);
console.log(`Configuration : version ${version}, serveur par défaut ${server || "(aucun)"}, hôtes ${hosts.join(", ")}`);
