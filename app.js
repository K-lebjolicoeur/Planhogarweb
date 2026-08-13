(function () {
  "use strict";

  var API_URL = "https://api.planhogar.com.ar/index.php?route=prod&limit=5000";
  var IMG_BASE = "https://api.planhogar.com.ar/uploads/";
  var PAGE_SIZE = 30;

  var PLACEHOLDER_IMG =
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">' +
        '<rect width="200" height="200" fill="#f0f1f3"/>' +
        '<path d="M100 40 L165 90 V160 H35 V90 Z" fill="none" stroke="#c7cad1" stroke-width="6"/>' +
        '<rect x="80" y="115" width="40" height="45" fill="none" stroke="#c7cad1" stroke-width="6"/>' +
        "</svg>"
    );

  var currencyFmt = new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });

  var els = {
    grid: document.getElementById("grid"),
    search: document.getElementById("search"),
    rubro: document.getElementById("rubro"),
    etiqueta: document.getElementById("etiqueta"),
    clearBtn: document.getElementById("clear-filters"),
    loadMoreBtn: document.getElementById("load-more"),
    resultsCount: document.getElementById("results-count"),
    emptyState: document.getElementById("empty-state"),
    errorState: document.getElementById("error-state"),
  };

  var state = {
    all: [],
    filtered: [],
    rendered: 0,
  };

  document.getElementById("year").textContent = new Date().getFullYear();

  function normalize(str) {
    return (str || "")
      .toString()
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "");
  }

  function money(value) {
    var n = Number(value);
    if (!n) return "-";
    return currencyFmt.format(n);
  }

  function photoUrl(p) {
    if (!p.foto_producto) return PLACEHOLDER_IMG;
    return IMG_BASE + p.foto_producto;
  }

  function uniqueSorted(list, key, idKey) {
    var seen = {};
    var out = [];
    list.forEach(function (item) {
      var id = item[idKey];
      var label = item[key];
      if (id == null || label == null) return;
      if (!seen[id]) {
        seen[id] = true;
        out.push({ id: id, label: label });
      }
    });
    out.sort(function (a, b) {
      return a.label.localeCompare(b.label, "es");
    });
    return out;
  }

  function populateFilters(products) {
    var rubros = uniqueSorted(products, "rubro", "id_rubro");
    var etiquetas = uniqueSorted(products, "nombre_etiqueta", "id_etiqueta");

    rubros.forEach(function (r) {
      var opt = document.createElement("option");
      opt.value = r.id;
      opt.textContent = r.label;
      els.rubro.appendChild(opt);
    });

    etiquetas.forEach(function (e) {
      var opt = document.createElement("option");
      opt.value = e.id;
      opt.textContent = e.label;
      els.etiqueta.appendChild(opt);
    });
  }

  function cardHtml(p) {
    var badge = p.nombre_etiqueta
      ? '<span class="badge">' + escapeHtml(p.nombre_etiqueta) + "</span>"
      : "";

    return (
      '<article class="card">' +
      '<div class="card-photo-wrap">' +
      badge +
      '<img loading="lazy" src="' +
      photoUrl(p) +
      '" alt="' +
      escapeHtml(p.nombre_producto) +
      '" onerror="this.onerror=null;this.src=\'' +
      PLACEHOLDER_IMG +
      "';\">" +
      "</div>" +
      '<div class="card-body">' +
      '<p class="card-rubro">' +
      escapeHtml(p.rubro || "") +
      "</p>" +
      '<p class="card-name">' +
      escapeHtml(p.nombre_producto) +
      "</p>" +
      '<p class="card-sku">Código: ' +
      escapeHtml(p.sku_producto || "-") +
      "</p>" +
      '<div class="price-contado"><small>Precio contado</small>' +
      money(p.precio_contado) +
      "</div>" +
      '<div class="plans">' +
      planRow("Plan 4 cuotas", p.precio_plan_1) +
      planRow("Plan 7 cuotas", p.precio_plan_2) +
      planRow("Plan 10-12 cuotas", p.precio_plan_3) +
      "</div>" +
      "</div>" +
      "</article>"
    );
  }

  function planRow(label, value) {
    return (
      '<div class="plan-row"><span class="plan-label">' +
      label +
      '</span><span class="plan-value">' +
      money(value) +
      "</span></div>"
    );
  }

  function escapeHtml(str) {
    return (str || "").toString().replace(/[&<>"']/g, function (c) {
      return (
        {
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c] || c
      );
    });
  }

  function applyFilters() {
    var term = normalize(els.search.value.trim());
    var rubro = els.rubro.value;
    var etiqueta = els.etiqueta.value;

    state.filtered = state.all.filter(function (p) {
      if (rubro && String(p.id_rubro) !== rubro) return false;
      if (etiqueta && String(p.id_etiqueta) !== etiqueta) return false;
      if (term) {
        var hay =
          normalize(p.nombre_producto).indexOf(term) !== -1 ||
          normalize(p.sku_producto).indexOf(term) !== -1;
        if (!hay) return false;
      }
      return true;
    });

    state.rendered = 0;
    els.grid.innerHTML = "";
    renderNextPage();
  }

  function renderNextPage() {
    var slice = state.filtered.slice(state.rendered, state.rendered + PAGE_SIZE);
    var html = slice.map(cardHtml).join("");
    els.grid.insertAdjacentHTML("beforeend", html);
    state.rendered += slice.length;

    var total = state.filtered.length;
    els.resultsCount.textContent =
      total === 0
        ? ""
        : "Mostrando " + state.rendered + " de " + total + " productos";

    els.emptyState.hidden = total !== 0;
    els.loadMoreBtn.hidden = state.rendered >= total;
  }

  function clearFilters() {
    els.search.value = "";
    els.rubro.value = "";
    els.etiqueta.value = "";
    applyFilters();
  }

  function debounce(fn, wait) {
    var t;
    return function () {
      clearTimeout(t);
      var args = arguments;
      t = setTimeout(function () {
        fn.apply(null, args);
      }, wait);
    };
  }

  els.search.addEventListener("input", debounce(applyFilters, 250));
  els.rubro.addEventListener("change", applyFilters);
  els.etiqueta.addEventListener("change", applyFilters);
  els.clearBtn.addEventListener("click", clearFilters);
  els.loadMoreBtn.addEventListener("click", renderNextPage);

  fetch(API_URL)
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (json) {
      if (!json || json.success !== true || !Array.isArray(json.data)) {
        throw new Error("Respuesta inesperada de la API");
      }
      state.all = json.data.filter(function (p) {
        return p.nombre_estado_producto !== "Inactivo";
      });
      populateFilters(state.all);
      applyFilters();
    })
    .catch(function (err) {
      console.error(err);
      els.errorState.hidden = false;
      els.resultsCount.textContent = "";
    });
})();
