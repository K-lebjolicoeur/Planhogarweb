(function () {
  "use strict";

  var API_URL = "https://api.planhogar.com.ar/index.php?route=prod&limit=5000";
  var IMG_BASE = "https://api.planhogar.com.ar/uploads/";
  var PAGE_SIZE = 30;
  var WHATSAPP_NUMBER = "5493513119444";
  var CART_KEY = "ph_cart_v2";

  // meses base de cada plan (usados para derivar las otras frecuencias)
  var PLAN_MESES = { precio_plan_1: 4, precio_plan_2: 7, precio_plan_3: 10 };
  var PLAN_LABELS = {
    precio_plan_1: "Plan 1",
    precio_plan_2: "Plan 2",
    precio_plan_3: "Plan 3",
  };
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
    cartToggle: document.getElementById("cart-toggle"),
    cartCount: document.getElementById("cart-count"),
    cartDrawer: document.getElementById("cart-drawer"),
    cartClose: document.getElementById("cart-close"),
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
    cart: [],
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
    ["precio_plan_1", "precio_plan_2", "precio_plan_3"].forEach(function (key) {
      var total = Number(product[key]);
      if (!total) return;
      var meses = PLAN_MESES[key];
      var rows = FRECUENCIAS.map(function (f) {
        var cuotas = meses * f.mult;
        return {
          freqLabel: f.label,
          cuotas: cuotas,
          cuotaValor: Math.round(total / cuotas),
        };
      });
      plans.push({
        key: key,
        label: PLAN_LABELS[key] + " (" + meses + " meses)",
        total: total,
        rows: rows,
      });
    });
    return plans;
  }

  // resuelve un "mode" ("contado" o "precio_plan_X|FreqLabel") contra el
  // producto y devuelve la etiqueta a mostrar + el precio unitario (total
  // a financiar para ese plan, o el precio de contado)
  function resolvePayment(product, mode) {
    if (!mode || mode === "contado") {
      return { label: "Contado", unitPrice: Number(product.precio_contado), freqLabel: null };
    }
    var parts = mode.split("|");
    var planKey = parts[0];
    var freqLabel = parts[1];
    var plan = planBreakdown(product).filter(function (pl) {
      return pl.key === planKey;
    })[0];
    if (!plan) {
      return { label: "Contado", unitPrice: Number(product.precio_contado), freqLabel: null };
    }
    var row = plan.rows.filter(function (r) {
      return r.freqLabel === freqLabel;
    })[0];
    if (!row) {
      return { label: "Contado", unitPrice: Number(product.precio_contado), freqLabel: null };
    }
    return {
      label: plan.label + " - " + freqLabel + " (" + row.cuotas + " cuotas de " + money(row.cuotaValor) + ")",
      unitPrice: plan.total,
      freqLabel: freqLabel,
    };
  }

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

  // ---------- calendario de cuotas ----------
  // regla: si la fecha calculada cae domingo, se corre al lunes siguiente

  function addDays(date, n) {
    var d = new Date(date);
    d.setDate(d.getDate() + n);
    return d;
  }

  function shiftSunday(date) {
    return date.getDay() === 0 ? addDays(date, 1) : date;
  }

  function formatDate(date) {
    return date.toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" });
  }

  function weekdayName(date) {
    return date.toLocaleDateString("es-AR", { weekday: "long" });
  }

  function scheduleText(freqLabel) {
    if (!freqLabel) return null;
    var today = new Date();
    today.setHours(0, 0, 0, 0);

    if (freqLabel === "Diario") {
      var first = shiftSunday(addDays(today, 1));
      return "Cobro de lunes a sábado. Primera cuota: " + formatDate(first) + ".";
    }
    if (freqLabel === "Semanal") {
      var firstW = shiftSunday(addDays(today, 7));
      return "Todas las semanas, los " + weekdayName(firstW) + ". Primera cuota: " + formatDate(firstW) + ".";
    }
    if (freqLabel === "Quincenal") {
      var firstQ = shiftSunday(addDays(today, 14));
      return "Cada 2 semanas, los " + weekdayName(firstQ) + ". Primera cuota: " + formatDate(firstQ) + ".";
    }
    if (freqLabel === "Mensual") {
      var day = today.getDate();
      var y = today.getFullYear();
      var m = today.getMonth() + 1;
      var lastDayNextMonth = new Date(y, m + 1, 0).getDate();
      var useDay = Math.min(day, lastDayNextMonth);
      var firstM = shiftSunday(new Date(y, m, useDay));
      return "El día " + day + " de cada mes. Primera cuota: " + formatDate(firstM) + ".";
    }
    return null;
  }

  // ---------- modal de producto ----------

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
      '<label for="pay-mode">Forma de pago a agregar al carrito</label>' +
      '<select id="pay-mode">' +
      payModeOptionsHtml(product, "contado") +
      "</select>" +
      '<p id="pay-schedule" class="pay-schedule"></p>' +
      '<div class="qty-row">' +
      '<label for="qty-input">Cantidad</label>' +
      '<div class="qty-stepper">' +
      '<button type="button" id="qty-minus">-</button>' +
      '<input type="number" id="qty-input" value="1" min="1" step="1">' +
      '<button type="button" id="qty-plus">+</button>' +
      "</div>" +
      "</div>" +
      '<button type="button" id="modal-add-cart" class="btn-load-more">Agregar al carrito</button>' +
      "</div>";

    var payModeSelect = document.getElementById("pay-mode");
    var scheduleEl = document.getElementById("pay-schedule");

    function updateSchedulePreview() {
      var resolved = resolvePayment(product, payModeSelect.value);
      var text = scheduleText(resolved.freqLabel);
      scheduleEl.textContent = text || "";
      scheduleEl.hidden = !text;
    }
    payModeSelect.addEventListener("change", updateSchedulePreview);
    updateSchedulePreview();

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
      addToCart(product, payModeSelect.value, qty);
      closeModal();
      openCart();
    });

    els.overlay.hidden = false;
    els.modal.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeModal() {
    els.modal.hidden = true;
    if (els.cartDrawer.hidden) {
      els.overlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }

  // ---------- carrito ----------
  // cada item guarda productId + mode ("contado" o "planKey|FreqLabel").
  // nombre/sku/foto quedan cacheados para poder mostrar el carrito incluso
  // si el catálogo todavía no terminó de cargar; precio y cronograma se
  // recalculan siempre desde el producto vivo (state.byId) cuando está.

  function loadCart() {
    try {
      var raw = localStorage.getItem(CART_KEY);
      state.cart = raw ? JSON.parse(raw) : [];
    } catch (e) {
      state.cart = [];
    }
  }

  function saveCart() {
    try {
      localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }

  function addToCart(product, mode, qty) {
    mode = mode || "contado";
    var existing = state.cart.filter(function (item) {
      return item.productId === product.id_producto && item.mode === mode;
    })[0];

    if (existing) {
      existing.qty += qty;
    } else {
      state.cart.push({
        productId: product.id_producto,
        nombre: product.nombre_producto,
        sku: product.sku_producto,
        foto: photoUrl(product),
        mode: mode,
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

  function changeCartMode(index, mode) {
    var item = state.cart[index];
    if (!item) return;
    item.mode = mode;
    saveCart();
    renderCart();
  }

  function cartLineInfo(item) {
    var product = state.byId[item.productId];
    if (!product) {
      return { label: "Cargando precio...", unitPrice: 0, scheduleTxt: null, loaded: false };
    }
    var resolved = resolvePayment(product, item.mode);
    return {
      label: resolved.label,
      unitPrice: resolved.unitPrice,
      scheduleTxt: scheduleText(resolved.freqLabel),
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

    if (state.cart.length === 0) {
      els.cartItems.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
    } else {
      els.cartItems.innerHTML = state.cart
        .map(function (item, index) {
          var info = cartLineInfo(item);
          var product = state.byId[item.productId];
          var selectHtml = product
            ? '<select class="cart-item-select" data-index="' +
              index +
              '">' +
              payModeOptionsHtml(product, item.mode) +
              "</select>"
            : "";
          var scheduleHtml = info.scheduleTxt
            ? '<p class="cart-item-schedule">' + escapeHtml(info.scheduleTxt) + "</p>"
            : "";

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
            (selectHtml || '<p class="cart-item-mode">' + escapeHtml(info.label) + "</p>") +
            scheduleHtml +
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
    els.cartCheckout.disabled = state.cart.length === 0;
    els.cartPdf.disabled = state.cart.length === 0;
  }

  function openCart() {
    els.overlay.hidden = false;
    els.cartDrawer.hidden = false;
    document.body.classList.add("no-scroll");
  }

  function closeCart() {
    els.cartDrawer.hidden = true;
    if (els.modal.hidden) {
      els.overlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }
  }

  function buildWhatsappMessage() {
    var lines = ["Hola! Quiero hacer este pedido:", ""];
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
          " - " +
          info.label +
          " - Subtotal: " +
          money(info.unitPrice * item.qty)
      );
      if (info.scheduleTxt) lines.push("   " + info.scheduleTxt);
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
        return (
          "<tr>" +
          "<td>" + (i + 1) + "</td>" +
          "<td>" + escapeHtml(item.nombre) + "<br><small>SKU: " + escapeHtml(item.sku || "-") + "</small></td>" +
          "<td>" + escapeHtml(info.label) + (info.scheduleTxt ? "<br><small>" + escapeHtml(info.scheduleTxt) + "</small>" : "") + "</td>" +
          "<td>" + item.qty + "</td>" +
          "<td>" + money(info.unitPrice * item.qty) + "</td>" +
          "</tr>"
        );
      })
      .join("");

    var today = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });

    var html =
      "<!doctype html><html><head><meta charset='utf-8'><title>Pedido PlanHogar</title><style>" +
      "body{font-family:Arial,Helvetica,sans-serif;color:#1c2230;padding:32px;}" +
      "h1{color:#1a5fb4;margin-bottom:0;}" +
      "p.date{color:#6b7280;margin-top:4px;}" +
      "table{width:100%;border-collapse:collapse;margin-top:20px;}" +
      "th,td{border:1px solid #e3e5ea;padding:8px;text-align:left;font-size:0.85rem;vertical-align:top;}" +
      "th{background:#eef4fc;}" +
      "small{color:#6b7280;}" +
      ".total{margin-top:16px;text-align:right;font-size:1.2rem;font-weight:bold;}" +
      "@media print{body{padding:0;}}" +
      "</style></head><body>" +
      "<h1>PlanHogar</h1>" +
      "<p class='date'>Pedido del " + today + "</p>" +
      "<table><thead><tr><th>#</th><th>Producto</th><th>Forma de pago</th><th>Cant.</th><th>Subtotal</th></tr></thead>" +
      "<tbody>" + rowsHtml + "</tbody></table>" +
      "<p class='total'>Total: " + money(cartTotal()) + "</p>" +
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
      if (p2) addToCart(p2, "contado", 1);
      return;
    }
  });

  els.modalClose.addEventListener("click", closeModal);
  els.overlay.addEventListener("click", function () {
    closeModal();
    closeCart();
  });
  els.cartToggle.addEventListener("click", openCart);
  els.cartClose.addEventListener("click", closeCart);
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
  els.cartItems.addEventListener("change", function (evt) {
    var select = evt.target.closest(".cart-item-select");
    if (!select) return;
    var index = parseInt(select.getAttribute("data-index"), 10);
    changeCartMode(index, select.value);
  });

  document.addEventListener("keydown", function (evt) {
    if (evt.key === "Escape") {
      closeModal();
      closeCart();
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
