/*
 * Logique sans interface de l'application mobile NeoScool (testée par
 * scripts/lib.test.mjs) : lecture d'un lien de portail ou d'un QR code,
 * normalisation de l'adresse du serveur, liste des établissements enregistrés.
 */
(function (root) {
  "use strict";

  var CODE = /^[A-Z0-9]{2,10}$/;
  var KINDS = ["parent", "eleve", "enseignant", "personnel"];

  /** Adresse d'un serveur : « ecole.exemple.com » → https://…, « 192.168.1.20:3000 » → http://… (réseau local). */
  function normalizeServer(text) {
    var raw = String(text || "").trim();
    if (!raw) return null;
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) && !/^https?:\/\//i.test(raw)) return null;
    if (!/^https?:\/\//i.test(raw)) {
      var host = raw.split(/[/?#]/)[0];
      var local = /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|[^.]+$)/i.test(host) || /\.local(:\d+)?$/i.test(host);
      raw = (local ? "http://" : "https://") + raw;
    }
    try {
      var url = new URL(raw);
      if (url.protocol !== "http:" && url.protocol !== "https:") return null;
      if (!url.hostname) return null;
      return url.origin;
    } catch (e) {
      return null;
    }
  }

  /**
   * Lien de portail (QR code de l'établissement, lien reçu par SMS / WhatsApp),
   * code d'établissement seul, ou adresse de serveur.
   * Renvoie { origin, code, portal } ou { error }.
   */
  function parseInput(text, fallbackServer) {
    var raw = String(text || "").trim();
    if (!raw) return { error: "Scannez le QR code ou saisissez le lien de votre établissement." };
    var code = raw.toUpperCase();
    if (CODE.test(code) && !/[.:/]/.test(raw)) {
      var server = normalizeServer(fallbackServer);
      if (!server) return { error: "Indiquez aussi l'adresse du serveur NeoScool de votre établissement." };
      return { origin: server, code: code, portal: null };
    }
    var origin = normalizeServer(raw);
    if (!origin) return { error: "Lien non reconnu. Exemple : https://…/acces/CODE" };
    var url;
    try {
      url = new URL(/^https?:\/\//i.test(raw) ? raw : origin + raw.replace(/^[^/]+/, ""));
    } catch (e) {
      return { error: "Lien non reconnu." };
    }
    var match = url.pathname.match(/\/acces\/([^/?#]+)/i);
    var portal = url.searchParams.get("portail");
    if (match) {
      var found = decodeURIComponent(match[1]).trim().toUpperCase();
      if (!CODE.test(found)) return { error: "Code d'établissement invalide dans le lien." };
      return { origin: origin, code: found, portal: KINDS.indexOf(portal) >= 0 ? portal : null };
    }
    return { origin: origin, code: null, portal: null };
  }

  function initials(name) {
    return String(name || "?")
      .split(/\s+/)
      .filter(function (w) {
        return /^[A-Za-zÀ-ÿ0-9]/.test(w) && !/^(de|du|des|la|le|les|et|d'|l')$/i.test(w);
      })
      .slice(0, 2)
      .map(function (w) {
        return w.charAt(0).toUpperCase();
      })
      .join("") || "?";
  }

  /** Ajoute ou met à jour un établissement (clé : serveur + code). */
  function upsert(list, entry) {
    var next = (list || []).filter(function (e) {
      return !(e.origin === entry.origin && e.code === entry.code);
    });
    var previous = (list || []).filter(function (e) {
      return e.origin === entry.origin && e.code === entry.code;
    })[0];
    next.unshift(Object.assign({}, previous || {}, entry, { added_at: (previous && previous.added_at) || new Date().toISOString() }));
    return next;
  }

  function remove(list, origin, code) {
    return (list || []).filter(function (e) {
      return !(e.origin === origin && e.code === code);
    });
  }

  /** Adresse du portail choisi (le serveur vérifie compte, établissement et rôle). */
  function portalUrl(entry, kind) {
    return entry.origin + "/acces/" + encodeURIComponent(entry.code) + (KINDS.indexOf(kind) >= 0 ? "?portail=" + kind : "");
  }

  var api = { normalizeServer: normalizeServer, parseInput: parseInput, initials: initials, upsert: upsert, remove: remove, portalUrl: portalUrl, KINDS: KINDS };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.NeoScoolLib = api;
})(typeof window !== "undefined" ? window : globalThis);
