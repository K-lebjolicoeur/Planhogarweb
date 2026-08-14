(function () {
  "use strict";

  var API_URL = "https://api.planhogar.com.ar/index.php?route=prod&limit=5000";
  var IMG_BASE = "https://api.planhogar.com.ar/uploads/";
  var PAGE_SIZE = 30;
  var WHATSAPP_NUMBER = "5493513119444";
  var CART_KEY = "ph_cart_v3";

  // definición de los planes de financiación. "plan_casa" reutiliza el
  // mismo campo/monto que Plan 3 (10 meses), solo aparece con otro nombre
  // en el selector.
  var PLAN_DEFS = [
    { key: "precio_plan_1", field: "precio_plan_1", label: "Plan 1", meses: 4 },
    { key: "precio_plan_2", field: "precio_plan_2", label: "Plan 2", meses: 7 },
    { key: "precio_plan_3", field: "precio_plan_3", label: "Plan 3", meses: 10 },
    { key: "plan_casa", field: "precio_plan_3", label: "Plan de la casa", meses: 10 },
  ];
  // multiplicador de cuotas por frecuencia respecto a la cantidad de meses
  var FRECUENCIAS = [
    { key: "mensual", label: "Mensual", mult: 1 },
    { key: "quincenal", label: "Quincenal", mult: 2 },
    { key: "semanal", label: "Semanal", mult: 4 },
    { key: "diario", label: "Diario", mult: 25 },
  ];

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
    overlay: document.getElementById("overlay"),
    modal: document.getElementById("product-modal"),
    modalBody: document.getElementById("modal-body"),
    modalClose: document.getElementById("modal-close"),
    planModal: document.getElementById("plan-modal"),
    planModalClose: document.getElementById("plan-modal-close"),
    planModalApply: document.getElementById("plan-modal-apply"),
    cartPayModeSelect: document.getElementById("cart-pay-mode"),
    cartDateRow: document.getElementById("cart-date-row"),
    cartStartDateInput: document.getElementById("cart-start-date"),
    cartSchedulePreview: document.getElementById("cart-schedule-preview"),
    cartToggle: document.getElementById("cart-toggle"),
    cartCount: document.getElementById("cart-count"),
    cartDrawer: document.getElementById("cart-drawer"),
    cartClose: document.getElementById("cart-close"),
    cartModeLabel: document.getElementById("cart-mode-label"),
    cartScheduleLine: document.getElementById("cart-schedule-line"),
    cartChoosePlanBtn: document.getElementById("cart-choose-plan"),
    cartItems: document.getElementById("cart-items"),
    cartTotal: document.getElementById("cart-total"),
    cartCheckout: document.getElementById("cart-checkout"),
    cartPdf: document.getElementById("cart-pdf"),
    cartClear: document.getElementById("cart-clear"),
  };

  var state = {
    all: [],
    byId: {},
    filtered: [],
    rendered: 0,
    cart: [], // [{productId, nombre, sku, foto, qty}]
    cartMode: "contado", // "contado" o "planKey|FreqLabel", aplica a TODO el carrito
    startDate: null, // "YYYY-MM-DD" elegida por el usuario, o null
  };

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

  function todayISO() {
    var d = new Date();
    var y = d.getFullYear();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return y + "-" + m + "-" + day;
  }

  function parseISODate(iso) {
    var parts = iso.split("-");
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  }

  // ---------- filtros ----------

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

  // ---------- tarjetas ----------

  function cardHtml(p) {
    var badge = p.nombre_etiqueta
      ? '<span class="badge">' + escapeHtml(p.nombre_etiqueta) + "</span>"
      : "";

    return (
      '<article class="card" data-id="' +
      p.id_producto +
      '">' +
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
      '<div class="card-actions">' +
      '<button type="button" class="btn-view-plans" data-id="' +
      p.id_producto +
      '">Ver planes</button>' +
      '<button type="button" class="btn-add-quick" data-id="' +
      p.id_producto +
      '">Agregar</button>' +
      "</div>" +
      "</div>" +
      "</article>"
    );
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

  // ---------- desglose de planes ----------

  function planBreakdown(product) {
    var plans = [];
    PLAN_DEFS.forEach(function (def) {
      var total = Number(product[def.field]);
      if (!total) return;
      var rows = FRECUENCIAS.map(function (f) {
        var cuotas = def.meses * f.mult;
        return {
          freqLabel: f.label,
          cuotas: cuotas,
          cuotaValor: Math.round(total / cuotas),
        };
      });
      plans.push({
        key: def.key,
        label: def.label + " (" + def.meses + " meses)",
        total: total,
        rows: rows,
      });
    });
    return plans;
  }

  // resuelve un "mode" ("contado" o "planKey|FreqLabel") contra el
  // producto y devuelve la etiqueta a mostrar + el precio unitario (total
  // a financiar para ese plan, o el precio de contado)
  function resolvePayment(product, mode) {
    var contado = {
      label: "Contado",
      unitPrice: Number(product.precio_contado),
      freqLabel: null,
      cuotas: null,
      cuotaValor: null,
    };
    if (!mode || mode === "contado") return contado;

    var parts = mode.split("|");
    var planKey = parts[0];
    var freqLabel = parts[1];
    var plan = planBreakdown(product).filter(function (pl) {
      return pl.key === planKey;
    })[0];
    if (!plan) return contado;

    var row = plan.rows.filter(function (r) {
      return r.freqLabel === freqLabel;
    })[0];
    if (!row) return contado;

    return {
      label: plan.label + " - " + freqLabel + " (" + row.cuotas + " cuotas de " + money(row.cuotaValor) + ")",
      unitPrice: plan.total,
      freqLabel: freqLabel,
      cuotas: row.cuotas,
      cuotaValor: row.cuotaValor,
    };
  }

  // opciones de forma de pago con precios, para el desglose informativo
  // de un producto puntual (modal "Ver planes")
  function payModeOptionsHtml(product, selectedMode) {
    var plans = planBreakdown(product);
    var selected = selectedMode || "contado";
    var html =
      '<option value="contado"' +
      (selected === "contado" ? " selected" : "") +
      ">Contado &mdash; " +
      money(product.precio_contado) +
      "</option>";

    plans.forEach(function (plan) {
      html += '<optgroup label="' + escapeHtml(plan.label) + '">';
      plan.rows.forEach(function (r) {
        var val = plan.key + "|" + r.freqLabel;
        html +=
          '<option value="' +
          val +
          '"' +
          (selected === val ? " selected" : "") +
          ">" +
          r.freqLabel +
          " (" +
          r.cuotas +
          " cuotas de " +
          money(r.cuotaValor) +
          ")</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  // opciones de forma de pago genéricas (sin $, aplica a todo el carrito
  // que puede tener productos de distinto precio) para el selector del
  // plan-modal
  function cartModeOptionsHtml(selectedMode) {
    var selected = selectedMode || "contado";
    var html =
      '<option value="contado"' + (selected === "contado" ? " selected" : "") + ">Contado (pago único)</option>";

    PLAN_DEFS.forEach(function (def) {
      html += '<optgroup label="' + escapeHtml(def.label) + " (" + def.meses + " meses)\">";
      FRECUENCIAS.forEach(function (f) {
        var cuotas = def.meses * f.mult;
        var val = def.key + "|" + f.label;
        html +=
          '<option value="' +
          val +
          '"' +
          (selected === val ? " selected" : "") +
          ">" +
          f.label +
          " (" +
          cuotas +
          " cuotas)</option>";
      });
      html += "</optgroup>";
    });
    return html;
  }

  // ---------- calendario de cuotas ----------
  // la fecha de inicio la elige el usuario; si cae domingo se corre al
  // lunes siguiente. a partir de ahí: diario cobra de lunes a sábado,
  // semanal/quincenal repiten el mismo día de semana, mensual repite el
  // mismo día del mes.

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function shiftSunday(date) {
    if (date.getDay() !== 0) return date;
    return addDays(date, 1);
  }

  function formatDate(date) {
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  }

  function formatDateLong(date) {
    return date.toLocaleDateString("es-AR", {
      weekday: "short",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  // fecha de vencimiento de cada cuota (1..count), a partir de la primera
  // fecha ya corrida de domingo. semanal/quincenal preservan el día de
  // semana sumando múltiplos de 7 (nunca vuelven a caer domingo); mensual
  // repite el día del mes pero hay que chequear domingo mes a mes; diario
  // cobra de lunes a sábado salteando domingos.
  function generateDueDates(freqLabel, firstDate, count) {
    var dates = [];
    if (freqLabel === "Diario") {
      var d = new Date(firstDate);
      while (dates.length < count) {
        if (d.getDay() !== 0) dates.push(new Date(d));
        d = addDays(d, 1);
      }
    } else if (freqLabel === "Semanal") {
      for (var i = 0; i < count; i++) dates.push(addDays(firstDate, i * 7));
    } else if (freqLabel === "Quincenal") {
      for (var j = 0; j < count; j++) dates.push(addDays(firstDate, j * 14));
    } else if (freqLabel === "Mensual") {
      var day = firstDate.getDate();
      for (var k = 0; k < count; k++) {
        var y = firstDate.getFullYear();
        var m = firstDate.getMonth() + k;
        var lastDayOfMonth = new Date(y, m + 1, 0).getDate();
        var useDay = Math.min(day, lastDayOfMonth);
        dates.push(shiftSunday(new Date(y, m, useDay)));
      }
    }
    return dates;
  }

  function weekdayName(date) {
    return date.toLocaleDateString("es-AR", { weekday: "long" });
  }

  function scheduleTextFromDate(freqLabel, chosenDate) {
    if (!freqLabel || !chosenDate) return null;
    var first = shiftSunday(chosenDate);

    if (freqLabel === "Diario") {
      return "Cobro de lunes a sábado. Primera cuota: " + formatDate(first) + ".";
    }
    if (freqLabel === "Semanal") {
      return "Todas las semanas, los " + weekdayName(first) + ". Primera cuota: " + formatDate(first) + ".";
    }
    if (freqLabel === "Quincenal") {
      return "Cada 2 semanas, los " + weekdayName(first) + ". Primera cuota: " + formatDate(first) + ".";
    }
    if (freqLabel === "Mensual") {
      return "El día " + first.getDate() + " de cada mes. Primera cuota: " + formatDate(first) + ".";
    }
    return null;
  }

  function currentFreqLabel() {
    if (state.cartMode === "contado") return null;
    return state.cartMode.split("|")[1];
  }

  function currentScheduleText() {
    var freqLabel = currentFreqLabel();
    if (!freqLabel) return null;
    if (!state.startDate) return null;
    return scheduleTextFromDate(freqLabel, parseISODate(state.startDate));
  }

  function genericModeLabel(mode) {
    if (!mode || mode === "contado") return "Contado";
    var parts = mode.split("|");
    var def = PLAN_DEFS.filter(function (d) {
      return d.key === parts[0];
    })[0];
    if (!def) return "Contado";
    var freqLabel = parts[1];
    var freq = FRECUENCIAS.filter(function (f) {
      return f.label === freqLabel;
    })[0];
    var cuotas = freq ? def.meses * freq.mult : "";
    return def.label + " - " + freqLabel + (cuotas ? " (" + cuotas + " cuotas)" : "");
  }

  // ---------- modal de producto (informativo) ----------

  function openModal(product) {
    var plans = planBreakdown(product);

    var planBlocks = plans
      .map(function (plan) {
        var rows = plan.rows
          .map(function (r) {
            return (
              '<div class="freq-row"><span class="freq-label">' +
              r.freqLabel +
              ":</span><span class=\"freq-value\">" +
              r.cuotas +
              " cuotas de " +
              money(r.cuotaValor) +
              "</span></div>"
            );
          })
          .join("");
        return (
          '<div class="plan-block">' +
          '<h3 class="plan-block-title">' +
          escapeHtml(plan.label) +
          "</h3>" +
          rows +
          "</div>"
        );
      })
      .join("");

    els.modalBody.innerHTML =
      '<div class="modal-photo"><img src="' +
      photoUrl(product) +
      '" alt="' +
      escapeHtml(product.nombre_producto) +
      "\" onerror=\"this.onerror=null;this.src='" +
      PLACEHOLDER_IMG +
      "';\"></div>" +
      '<h2 id="modal-title" class="modal-name">' +
      escapeHtml(product.nombre_producto) +
      "</h2>" +
      '<p class="modal-sku">Código: ' +
      escapeHtml(product.sku_producto || "-") +
      "</p>" +
      '<div class="modal-contado"><small>Precio de contado</small>' +
      money(product.precio_contado) +
      "</div>" +
      '<div class="plan-blocks">' +
      planBlocks +
      "</div>" +
      '<div class="modal-buy">' +
      '<div class="qty-row">' +
      '<label for="qty-input">Cantidad</label>' +
      '<div class="qty-stepper">' +
      '<button type="button" id="qty-minus">-</button>' +
      '<input type="number" id="qty-input" value="1" min="1" step="1">' +
      '<button type="button" id="qty-plus">+</button>' +
      "</div>" +
      "</div>" +
      '<button type="button" id="modal-add-cart" class="btn-load-more">Agregar al carrito</button>' +
      '<p class="modal-hint">La forma de pago (contado / plan) se elige una sola vez para todo el carrito, desde el botón "Elegir plan y fecha".</p>' +
      "</div>";

    document.getElementById("qty-minus").addEventListener("click", function () {
      var input = document.getElementById("qty-input");
      input.value = Math.max(1, (parseInt(input.value, 10) || 1) - 1);
    });
    document.getElementById("qty-plus").addEventListener("click", function () {
      var input = document.getElementById("qty-input");
      input.value = (parseInt(input.value, 10) || 1) + 1;
    });
    document.getElementById("modal-add-cart").addEventListener("click", function () {
      var qty = Math.max(1, parseInt(document.getElementById("qty-input").value, 10) || 1);
      addToCart(product, qty);
      closeModal();
      openCart();
    });

    els.overlay.hidden = false;
    els.modal.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeModal() {
    els.modal.hidden = true;
    if (els.cartDrawer.hidden && els.planModal.hidden) {
      els.overlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }

  // ---------- modal de plan de pago (carrito completo) ----------

  function updatePlanModalPreview() {
    var mode = els.cartPayModeSelect.value;
    var isPlan = mode !== "contado";
    els.cartDateRow.hidden = !isPlan;

    if (!isPlan) {
      els.cartSchedulePreview.hidden = true;
      return;
    }
    var freqLabel = mode.split("|")[1];
    var dateVal = els.cartStartDateInput.value;
    var text = dateVal ? scheduleTextFromDate(freqLabel, parseISODate(dateVal)) : null;
    els.cartSchedulePreview.textContent = text || "Elegí una fecha de inicio.";
    els.cartSchedulePreview.hidden = false;
  }

  function openPlanModal() {
    els.cartPayModeSelect.innerHTML = cartModeOptionsHtml(state.cartMode);
    els.cartStartDateInput.min = todayISO();
    els.cartStartDateInput.value = state.startDate || "";
    updatePlanModalPreview();

    els.overlay.hidden = false;
    els.planModal.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closePlanModal() {
    els.planModal.hidden = true;
    if (els.cartDrawer.hidden && els.modal.hidden) {
      els.overlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }

  function applyPlanModal() {
    var mode = els.cartPayModeSelect.value;
    if (mode !== "contado" && !els.cartStartDateInput.value) {
      els.cartSchedulePreview.textContent = "Elegí una fecha de inicio antes de aplicar.";
      els.cartSchedulePreview.hidden = false;
      return;
    }
    state.cartMode = mode;
    state.startDate = mode === "contado" ? null : els.cartStartDateInput.value;
    saveCart();
    renderCart();
    closePlanModal();
    if (els.modal.hidden) openCart();
  }

  // ---------- carrito ----------
  // cada item guarda solo productId + qty; el precio y el cronograma se
  // recalculan siempre a partir del plan/fecha elegidos para TODO el
  // carrito (state.cartMode / state.startDate), no por producto.

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      var parsed = raw ? JSON.parse(raw) : null;
      if (parsed && Array.isArray(parsed.items)) {
        state.cart = parsed.items;
        state.cartMode = parsed.mode || "contado";
        state.startDate = parsed.startDate || null;
      } else {
        state.cart = [];
      }
    } catch (e) {
      state.cart = [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(
        CART_KEY,
        JSON.stringify({ items: state.cart, mode: state.cartMode, startDate: state.startDate })
      );
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }

  function addToCart(product, qty) {
    var existing = state.cart.filter(function (item) {
      return item.productId === product.id_producto;
    })[0];

    if (existing) {
      existing.qty += qty;
    } else {
      state.cart.push({
        productId: product.id_producto,
        nombre: product.nombre_producto,
        sku: product.sku_producto,
        foto: photoUrl(product),
        qty: qty,
      });
    }
    saveCart();
    renderCart();
  }

  function removeFromCart(index) {
    state.cart.splice(index, 1);
    saveCart();
    renderCart();
  }

  function changeCartQty(index, delta) {
    var item = state.cart[index];
    if (!item) return;
    item.qty = Math.max(1, item.qty + delta);
    saveCart();
    renderCart();
  }

  function cartLineInfo(item) {
    var product = state.byId[item.productId];
    if (!product) {
      return { label: "Cargando precio...", unitPrice: 0, cuotas: null, cuotaValor: null, loaded: false };
    }
    var resolved = resolvePayment(product, state.cartMode);
    return {
      label: resolved.label,
      unitPrice: resolved.unitPrice,
      cuotas: resolved.cuotas,
      cuotaValor: resolved.cuotaValor,
      loaded: true,
    };
  }

  function cartTotal() {
    return state.cart.reduce(function (sum, item) {
      return sum + cartLineInfo(item).unitPrice * item.qty;
    }, 0);
  }

  function renderCart() {
    var count = state.cart.reduce(function (sum, item) {
      return sum + item.qty;
    }, 0);
    els.cartCount.textContent = count;
    els.cartCount.hidden = count === 0;

    els.cartModeLabel.textContent = genericModeLabel(state.cartMode);

    var scheduleTxt = currentScheduleText();
    var freqLabel = currentFreqLabel();
    if (freqLabel && !state.startDate) {
      els.cartScheduleLine.textContent = "Elegí una fecha de inicio para ver el cronograma de cuotas.";
      els.cartScheduleLine.hidden = false;
    } else if (scheduleTxt) {
      els.cartScheduleLine.textContent = scheduleTxt;
      els.cartScheduleLine.hidden = false;
    } else {
      els.cartScheduleLine.hidden = true;
    }

    if (state.cart.length === 0) {
      els.cartItems.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    } else {
      els.cartItems.innerHTML = state.cart
        .map(function (item, index) {
          var info = cartLineInfo(item);
          return (
            '<div class="cart-item">' +
            '<img src="' +
            item.foto +
            '" alt="' +
            escapeHtml(item.nombre) +
            '">' +
            '<div class="cart-item-info">' +
            '<p class="cart-item-name">' +
            escapeHtml(item.nombre) +
            "</p>" +
            '<p class="cart-item-mode">' +
            escapeHtml(info.label) +
            "</p>" +
            '<div class="cart-item-qty">' +
            '<button type="button" data-action="dec" data-index="' +
            index +
            '">-</button>' +
            '<span>' +
            item.qty +
            "</span>" +
            '<button type="button" data-action="inc" data-index="' +
            index +
            '">+</button>' +
            '<button type="button" class="cart-item-remove" data-action="remove" data-index="' +
            index +
            '">Quitar</button>' +
            "</div>" +
            "</div>" +
            '<div class="cart-item-subtotal">' +
            money(info.unitPrice * item.qty) +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    els.cartTotal.textContent = money(cartTotal());
    var needsDate = !!freqLabel && !state.startDate;
    els.cartCheckout.disabled = state.cart.length === 0 || needsDate;
    els.cartPdf.disabled = state.cart.length === 0 || needsDate;
  }

  function openCart() {
    els.overlay.hidden = false;
    els.cartDrawer.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeCart() {
    els.cartDrawer.hidden = true;
    if (els.modal.hidden && els.planModal.hidden) {
      els.overlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }

  function buildWhatsappMessage() {
    var lines = ["Hola! Quiero hacer este pedido:", "", "Forma de pago: " + genericModeLabel(state.cartMode)];
    var scheduleTxt = currentScheduleText();
    if (scheduleTxt) lines.push(scheduleTxt);
    lines.push("");
    state.cart.forEach(function (item, i) {
      var info = cartLineInfo(item);
      lines.push(
        (i + 1) +
          ") " +
          item.nombre +
          " (SKU: " +
          (item.sku || "-") +
          ") - Cant: " +
          item.qty +
          " - Subtotal: " +
          money(info.unitPrice * item.qty)
      );
    });
    lines.push("");
    lines.push("Total: " + money(cartTotal()));
    return lines.join("\n");
  }

  // genera un PDF real vía el diálogo de impresión del navegador (no hay
  // forma de adjuntar un archivo automáticamente en un link de wa.me,
  // así que el cliente lo descarga acá y lo adjunta a mano en WhatsApp)
  function downloadOrderPdf() {
    if (state.cart.length === 0) return;
    var win = window.open("", "_blank");
    if (!win) {
      alert("Habilitá las ventanas emergentes del navegador para generar el PDF.");
      return;
    }

    var rowsHtml = state.cart
      .map(function (item, i) {
        var info = cartLineInfo(item);
        var cuotaTxt = info.cuotas
          ? info.cuotas + " cuotas de " + money(info.cuotaValor) + " c/u"
          : "Pago único";
        return (
          "<tr>" +
          "<td>" + (i + 1) + "</td>" +
          "<td>" + escapeHtml(item.nombre) + "<br><small>SKU: " + escapeHtml(item.sku || "-") + "</small></td>" +
          "<td>" + item.qty + "</td>" +
          "<td>" + cuotaTxt + "</td>" +
          "<td>" + money(info.unitPrice * item.qty) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var today = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    var scheduleTxt = currentScheduleText();
    var freqLabel = currentFreqLabel();

    // planilla de seguimiento de cuotas: una fila por cuota con fecha de
    // vencimiento + monto total pre-cargados, y columnas en blanco para
    // que el cobrador anote lo pagado y la firma
    var paymentTableHtml = "";
    if (freqLabel && state.startDate && state.cart.length > 0) {
      var firstItemInfo = cartLineInfo(state.cart[0]);
      var cuotasCount = firstItemInfo.cuotas || 0;
      var montoPerCuota = state.cart.reduce(function (sum, item) {
        return sum + (cartLineInfo(item).cuotaValor || 0);
      }, 0);
      var firstDate = shiftSunday(parseISODate(state.startDate));
      var dueDates = generateDueDates(freqLabel, firstDate, cuotasCount);

      var paymentRowsHtml = dueDates
        .map(function (d, idx) {
          return (
            "<tr>" +
            "<td>" + (idx + 1) + "</td>" +
            "<td>" + formatDateLong(d) + "</td>" +
            "<td>" + money(montoPerCuota) + "</td>" +
            "<td></td>" +
            "<td></td>" +
            "<td></td>" +
            "</tr>"
          );
        })
        .join("");

      paymentTableHtml =
        "<h2 class='pay-title'>Planilla de cuotas</h2>" +
        "<table class='pay-table'><thead><tr>" +
        "<th>Nº</th><th>Fecha de pago</th><th>Monto</th><th>Fecha pagado</th><th>Pagado $</th><th>Firma</th>" +
        "</tr></thead><tbody>" + paymentRowsHtml + "</tbody></table>";
    }

    var logoUrl = new URL("logo.png", window.location.href).href;

    var html =
      "<!doctype html><html><head><meta charset='utf-8'><title>Pedido PlanHogar</title><style>" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#1c2230;padding:32px;}" +
      ".brand-row{display:flex;align-items:center;gap:12px;}" +
      ".brand-row img{height:48px;width:auto;}" +
      "h1{color:#f7941d;margin:0;}" +
      "p.date{color:#6b7280;margin-top:4px;}" +
      "p.plan{margin-top:16px;font-weight:bold;}" +
      "p.schedule{color:#c96f00;background:#fff3e0;padding:8px 12px;border-radius:6px;}" +
      "table{width:100%;border-collapse:collapse;margin-top:20px;}" +
      "th,td{border:1px solid #e3e5ea;padding:8px;text-align:left;font-size:0.85rem;vertical-align:top;}" +
      "th{background:#fff3e0;}" +
      "small{color:#6b7280;}" +
      ".total{margin-top:16px;text-align:right;font-size:1.2rem;font-weight:bold;}" +
      "h2.pay-title{margin-top:36px;color:#f7941d;font-size:1.05rem;}" +
      "table.pay-table th,table.pay-table td{border:1px solid #1c2230;padding:10px;}" +
      "table.pay-table td:nth-child(4),table.pay-table td:nth-child(5),table.pay-table td:nth-child(6){min-height:28px;}" +
      "table.pay-table tr{page-break-inside:avoid;}" +
      "@media print{body{padding:0;}}" +
      "</style></head><body>" +
      "<div class='brand-row'><img src='" + logoUrl + "' alt='PlanHogar'><h1>PlanHogar</h1></div>" +
      "<p class='date'>Pedido del " + today + "</p>" +
      "<p class='plan'>Forma de pago: " + escapeHtml(genericModeLabel(state.cartMode)) + "</p>" +
      (scheduleTxt ? "<p class='schedule'>" + escapeHtml(scheduleTxt) + "</p>" : "") +
      "<table><thead><tr><th>#</th><th>Producto</th><th>Cant.</th><th>Cuota</th><th>Subtotal</th></tr></thead>" +
      "<tbody>" + rowsHtml + "</tbody></table>" +
      "<p class='total'>Total: " + money(cartTotal()) + "</p>" +
      paymentTableHtml +
      "</body></html>";

    win.document.open();
    win.document.write(html);
    win.document.close();

    setTimeout(function () {
      win.focus();
      win.print();
    }, 300);
  }

  // ---------- eventos ----------

  els.search.addEventListener("input", debounce(applyFilters, 250));
  els.rubro.addEventListener("change", applyFilters);
  els.etiqueta.addEventListener("change", applyFilters);
  els.clearBtn.addEventListener("click", clearFilters);
  els.loadMoreBtn.addEventListener("click", renderNextPage);

  els.grid.addEventListener("click", function (evt) {
    var viewBtn = evt.target.closest(".btn-view-plans");
    var addBtn = evt.target.closest(".btn-add-quick");

    if (viewBtn) {
      var product = state.byId[viewBtn.getAttribute("data-id")];
      if (product) openModal(product);
      return;
    }
    if (addBtn) {
      var p2 = state.byId[addBtn.getAttribute("data-id")];
      if (p2) addToCart(p2, 1);
      return;
    }
  });

  els.modalClose.addEventListener("click", closeModal);
  els.overlay.addEventListener("click", function () {
    closeModal();
    closeCart();
    closePlanModal();
  });
  els.cartToggle.addEventListener("click", openCart);
  els.cartClose.addEventListener("click", closeCart);
  els.cartChoosePlanBtn.addEventListener("click", openPlanModal);
  els.planModalClose.addEventListener("click", closePlanModal);
  els.planModalApply.addEventListener("click", applyPlanModal);
  els.cartPayModeSelect.addEventListener("change", updatePlanModalPreview);
  els.cartStartDateInput.addEventListener("change", updatePlanModalPreview);
  els.cartClear.addEventListener("click", function () {
    state.cart = [];
    saveCart();
    renderCart();
  });
  els.cartCheckout.addEventListener("click", function () {
    if (state.cart.length === 0) return;
    var msg = buildWhatsappMessage();
    var url = "https://wa.me/" + WHATSAPP_NUMBER + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank", "noopener");
  });
  els.cartPdf.addEventListener("click", downloadOrderPdf);
  els.cartItems.addEventListener("click", function (evt) {
    var btn = evt.target.closest("button[data-action]");
    if (!btn) return;
    var index = parseInt(btn.getAttribute("data-index"), 10);
    var action = btn.getAttribute("data-action");
    if (action === "inc") changeCartQty(index, 1);
    if (action === "dec") changeCartQty(index, -1);
    if (action === "remove") removeFromCart(index);
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.key === "Escape") {
      closeModal();
      closeCart();
      closePlanModal();
    }
  });

  // ---------- carga inicial ----------

  loadCart();
  renderCart();

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
      state.all.forEach(function (p) {
        state.byId[p.id_producto] = p;
      });
      populateFilters(state.all);
      applyFilters();
      renderCart();
    })
    .catch(function (err) {
      console.error(err);
      els.errorState.hidden = false;
      els.resultsCount.textContent = "";
    });
})();
