/*
 * Application mobile NeoScool : écrans locaux (établissements enregistrés,
 * scan du QR code, saisie du lien, choix du portail). Les portails eux-mêmes
 * sont servis par le serveur de l'établissement : la connexion, les droits et
 * les données restent ceux du compte, vérifiés par le serveur.
 */
(function () {
  "use strict";

  var Lib = window.NeoScoolLib;
  var CONFIG = window.NEOSCOOL_CONFIG || { version: "1.0.0", defaultServer: "" };
  var Cap = window.Capacitor;
  var Plugins = (Cap && Cap.Plugins) || {};
  var STORE_KEY = "neoscool.etablissements";
  var SCREENS = ["home", "scan", "saisie", "org", "open", "error"];

  var state = { list: [], current: null, stream: null, scanTimer: null, retry: null, history: [] };

  // ---------------------------------------------------------------- stockage
  // Préférences natives (Capacitor) ; à défaut, stockage du navigateur. Seuls le
  // serveur, le code et l'identité publique de l'établissement sont conservés.
  function load() {
    if (Plugins.Preferences) {
      return Plugins.Preferences.get({ key: STORE_KEY }).then(function (r) {
        return parse(r && r.value);
      }, function () {
        return [];
      });
    }
    try {
      return Promise.resolve(parse(window.localStorage.getItem(STORE_KEY)));
    } catch (e) {
      return Promise.resolve([]);
    }
  }
  function parse(raw) {
    try {
      var data = JSON.parse(raw || "[]");
      return Array.isArray(data) ? data : [];
    } catch (e) {
      return [];
    }
  }
  function save() {
    var value = JSON.stringify(state.list);
    if (Plugins.Preferences) return Plugins.Preferences.set({ key: STORE_KEY, value: value }).catch(function () {});
    try {
      window.localStorage.setItem(STORE_KEY, value);
    } catch (e) {
      /* stockage indisponible : la liste reste en mémoire */
    }
    return Promise.resolve();
  }

  // ---------------------------------------------------------------- écrans
  function $(id) {
    return document.getElementById(id);
  }
  function show(name, push) {
    if (push !== false && state.screen && state.screen !== name && ["open", "error"].indexOf(state.screen) < 0) state.history.push(state.screen);
    state.screen = name;
    if (name === "home") renderHome();
    SCREENS.forEach(function (s) {
      $("screen-" + s).hidden = s !== name;
    });
    $("btn-back").hidden = name === "home";
    if (name !== "scan") stopScan();
    window.scrollTo(0, 0);
  }
  function back() {
    var prev = state.history.pop();
    if (prev) show(prev, false);
    else if (state.screen !== "home") show("home", false);
    else if (Plugins.App) Plugins.App.exitApp();
  }

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === "text") node.textContent = attrs[k];
      else if (k === "onclick") node.addEventListener("click", attrs[k]);
      else node.setAttribute(k, attrs[k]);
    });
    (children || []).forEach(function (c) {
      if (c) node.appendChild(c);
    });
    return node;
  }

  /** Pastille de l'établissement : logo publié, sinon initiales sur sa couleur. */
  function badge(entry, big) {
    var color = /^#[0-9a-f]{6}$/i.test(entry.primary_color || "") ? entry.primary_color : "#1d63ed";
    var box = el("span", { class: "avatar" + (big ? " big" : ""), style: "background:" + color }, [el("span", { text: Lib.initials(entry.name) })]);
    if (entry.logo_url) {
      var img = el("img", { src: entry.logo_url, alt: "" });
      img.addEventListener("load", function () {
        box.classList.add("has-logo");
      });
      img.addEventListener("error", function () {
        img.remove();
      });
      box.appendChild(img);
    }
    return box;
  }

  function renderHome() {
    var list = state.list;
    $("home-empty").hidden = list.length > 0;
    $("home-list-wrap").hidden = list.length === 0;
    var ul = $("home-list");
    ul.textContent = "";
    list.forEach(function (entry) {
      ul.appendChild(
        el("li", {}, [
          el("button", { type: "button", class: "card", onclick: function () {
            openOrg(entry);
          } }, [
            badge(entry),
            el("span", { class: "meta" }, [
              el("strong", { text: entry.name || entry.code }),
              el("small", { text: [entry.type_label, entry.city].filter(Boolean).join(" · ") || entry.origin.replace(/^https?:\/\//, "") }),
            ]),
            el("span", { class: "chev", "aria-hidden": "true", text: "›" }),
          ]),
        ]),
      );
    });
  }

  function renderOrg(entry) {
    var head = $("org-head");
    head.textContent = "";
    head.appendChild(badge(entry, true));
    head.appendChild(
      el("div", {}, [
        el("strong", { text: entry.name || entry.code }),
        el("small", { text: [entry.type_label, entry.city].filter(Boolean).join(" · ") }),
        entry.is_demo ? el("span", { class: "badge-demo", text: "Établissement de démonstration" }) : null,
      ]),
    );
    var ul = $("org-portals");
    ul.textContent = "";
    var portals = entry.portals && entry.portals.length ? entry.portals : Lib.KINDS.map(function (k) {
      return { kind: k, label: k };
    });
    portals.forEach(function (p) {
      ul.appendChild(
        el("li", {}, [
          el("button", { type: "button", class: "portal" + (entry.portal === p.kind ? " suggested" : ""), onclick: function () {
            openPortal(entry, p.kind);
          } }, [
            el("span", { class: "meta" }, [el("strong", { text: p.label }), p.sub ? el("small", { text: p.sub }) : null]),
            el("span", { class: "chev", "aria-hidden": "true", text: "›" }),
          ]),
        ]),
      );
    });
  }

  function fail(title, text, retry) {
    $("error-title").textContent = title;
    $("error-text").textContent = text;
    state.retry = retry || null;
    $("error-retry").hidden = !retry;
    show("error");
  }

  // ---------------------------------------------------------------- serveur
  /** Identité publique de l'établissement (nom, type, logo, portails ouverts). */
  function fetchOrg(origin, code) {
    var ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    var timer = setTimeout(function () {
      if (ctrl) ctrl.abort();
    }, 12000);
    return fetch(origin + "/api/app/etablissement/" + encodeURIComponent(code), { headers: { Accept: "application/json" }, signal: ctrl ? ctrl.signal : undefined })
      .then(function (res) {
        return res.json().catch(function () {
          return {};
        }).then(function (body) {
          if (!res.ok) throw Object.assign(new Error(body.error || "Établissement introuvable."), { status: res.status });
          return body;
        });
      })
      .finally(function () {
        clearTimeout(timer);
      });
  }

  function addFrom(parsed) {
    if (parsed.error) return Promise.reject(new Error(parsed.error));
    if (!parsed.code) return Promise.reject(new Error("Ce lien ne contient pas le code de l'établissement. Utilisez le lien « /acces/CODE » ou le QR code de l'établissement."));
    $("open-text").textContent = "Recherche de l'établissement…";
    show("open");
    return fetchOrg(parsed.origin, parsed.code).then(
      function (org) {
        var entry = {
          origin: parsed.origin,
          code: org.code || parsed.code,
          name: org.name,
          type_label: org.type_label,
          city: org.city,
          primary_color: org.primary_color,
          logo_url: org.logo_url,
          is_demo: Boolean(org.is_demo),
          portals: (org.portals || []).map(function (p) {
            return { kind: p.kind, label: p.label, sub: p.sub };
          }),
          portal: parsed.portal,
        };
        state.list = Lib.upsert(state.list, entry);
        return save().then(function () {
          state.history = ["home"];
          openOrg(state.list[0], true);
        });
      },
      function (err) {
        var unreachable = !err.status;
        fail(
          unreachable ? "Établissement injoignable" : "Établissement introuvable",
          unreachable
            ? "Le serveur " + parsed.origin.replace(/^https?:\/\//, "") + " ne répond pas. Vérifiez la connexion Internet ou le Wi-Fi (pour un serveur local, le téléphone doit être sur le même Wi-Fi que l'ordinateur)."
            : err.message,
          function () {
            addFrom(parsed);
          },
        );
      },
    );
  }

  function openOrg(entry, replace) {
    state.current = entry;
    renderOrg(entry);
    show("org", !replace);
    // Mise à jour silencieuse du nom, du logo et des portails ouverts.
    fetchOrg(entry.origin, entry.code).then(function (org) {
      var updated = Object.assign({}, entry, {
        name: org.name,
        type_label: org.type_label,
        city: org.city,
        primary_color: org.primary_color,
        logo_url: org.logo_url,
        is_demo: Boolean(org.is_demo),
        portals: (org.portals || []).map(function (p) {
          return { kind: p.kind, label: p.label, sub: p.sub };
        }),
      });
      state.list = state.list.map(function (e) {
        return e.origin === entry.origin && e.code === entry.code ? updated : e;
      });
      save();
      if (state.current && state.current.code === entry.code && state.current.origin === entry.origin && state.screen === "org") {
        state.current = updated;
        renderOrg(updated);
      }
    }, function () {});
  }

  /** Ouvre le portail sur le serveur de l'établissement (navigation dans l'application). */
  function openPortal(entry, kind) {
    $("open-text").textContent = "Ouverture du portail…";
    show("open");
    var list = state.list.map(function (e) {
      return e.origin === entry.origin && e.code === entry.code ? Object.assign({}, e, { last_portal: kind, opened_at: new Date().toISOString() }) : e;
    });
    state.list = list;
    save().then(function () {
      window.location.href = Lib.portalUrl(entry, kind);
    });
  }

  // ---------------------------------------------------------------- scan
  function startScan() {
    show("scan");
    var status = $("scan-status");
    status.textContent = "Placez le QR code de l'établissement dans le cadre.";
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia || !window.jsQR) {
      status.textContent = "La caméra n'est pas disponible sur cet appareil : saisissez le lien à la place.";
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" }, audio: false })
      .then(function (stream) {
        if (state.screen !== "scan") {
          stream.getTracks().forEach(function (t) {
            t.stop();
          });
          return;
        }
        state.stream = stream;
        var video = $("scan-video");
        video.srcObject = stream;
        video.play();
        var canvas = $("scan-canvas");
        var ctx = canvas.getContext("2d", { willReadFrequently: true });
        state.scanTimer = setInterval(function () {
          if (!video.videoWidth) return;
          var w = Math.min(640, video.videoWidth);
          var h = Math.round((video.videoHeight / video.videoWidth) * w);
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(video, 0, 0, w, h);
          var found = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: "dontInvert" });
          if (found && found.data) {
            var parsed = Lib.parseInput(found.data, CONFIG.defaultServer);
            if (parsed.error || !parsed.code) {
              status.textContent = "Ce QR code n'est pas celui d'un établissement NeoScool.";
              return;
            }
            if (navigator.vibrate) navigator.vibrate(60);
            stopScan();
            addFrom(parsed);
          }
        }, 250);
      })
      .catch(function () {
        status.textContent = "Accès à la caméra refusé. Autorisez la caméra dans les réglages du téléphone, ou saisissez le lien.";
      });
  }
  function stopScan() {
    if (state.scanTimer) clearInterval(state.scanTimer);
    state.scanTimer = null;
    if (state.stream) {
      state.stream.getTracks().forEach(function (t) {
        t.stop();
      });
      state.stream = null;
    }
  }

  // ---------------------------------------------------------------- saisie
  function setupForm() {
    var form = $("form-add");
    var link = $("add-link");
    var server = $("add-server");
    var error = $("add-error");
    if (CONFIG.defaultServer) server.value = CONFIG.defaultServer.replace(/^https?:\/\//, "");
    function toggleServer() {
      var v = link.value.trim();
      $("server-row").hidden = !(v && /^[A-Za-z0-9]{2,10}$/.test(v));
    }
    link.addEventListener("input", toggleServer);
    toggleServer();
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var parsed = Lib.parseInput(link.value, server.value || CONFIG.defaultServer);
      if (parsed.error || !parsed.code) {
        error.textContent = parsed.error || "Ce lien ne contient pas le code de l'établissement (lien « /acces/CODE »).";
        error.hidden = false;
        return;
      }
      error.hidden = true;
      addFrom(parsed);
    });
  }

  // ---------------------------------------------------------------- démarrage
  function wire() {
    document.addEventListener("click", function (e) {
      var go = e.target.closest && e.target.closest("[data-go]");
      if (!go) return;
      var target = go.getAttribute("data-go");
      if (target === "scan") startScan();
      else if (target === "home") {
        state.history = [];
        renderHome();
        show("home", false);
      } else show(target);
    });
    $("btn-back").addEventListener("click", back);
    $("open-cancel").addEventListener("click", function () {
      window.stop && window.stop();
      show(state.current ? "org" : "home", false);
    });
    $("error-retry").addEventListener("click", function () {
      if (state.retry) state.retry();
    });
    $("org-remove").addEventListener("click", function () {
      var entry = state.current;
      if (!entry || !window.confirm("Retirer « " + (entry.name || entry.code) + " » de l'application ? Vous pourrez l'ajouter de nouveau avec son QR code.")) return;
      state.list = Lib.remove(state.list, entry.origin, entry.code);
      save().then(function () {
        state.current = null;
        state.history = [];
        renderHome();
        show("home", false);
      });
    });
    if (Plugins.App && Plugins.App.addListener) Plugins.App.addListener("backButton", back);
    window.addEventListener("hashchange", route);
    $("foot").textContent = "NeoScool · version " + CONFIG.version;
  }

  /** « #etablissements » : retour depuis un portail (bouton « Mes établissements »). */
  function route() {
    state.history = [];
    renderHome();
    show("home", false);
  }

  function init() {
    wire();
    setupForm();
    if (Plugins.StatusBar && Plugins.StatusBar.setBackgroundColor) Plugins.StatusBar.setBackgroundColor({ color: "#0B1F3A" }).catch(function () {});
    load().then(function (list) {
      state.list = list;
      renderHome();
      show("home", false);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
