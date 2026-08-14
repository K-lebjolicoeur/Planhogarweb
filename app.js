(function () {
  "use strict";

  var API_URL = "https://api.planhogar.com.ar/index.php?route=prod&limit=5000";
  var IMG_BASE = "https://api.planhogar.com.ar/uploads/";
  var PAGE_SIZE = 30;
  var WHATSAPP_NUMBER = "5493513119444";
  var CART_KEY = "ph_cart_v1";

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

    var payOptions =
      '<option value="contado">Contado &mdash; ' + money(product.precio_contado) + "</option>" +
      plans
        .map(function (plan) {
          return (
            '<optgroup label="' +
            escapeHtml(plan.label) +
            '">' +
            plan.rows
              .map(function (r) {
                var val = plan.key + "|" + r.freqLabel;
                return (
                  '<option value="' +
                  val +
                  '">' +
                  escapeHtml(plan.label) +
                  " - " +
                  r.freqLabel +
                  " (" +
                  r.cuotas +
                  " cuotas de " +
                  money(r.cuotaValor) +
                  ")</option>"
                );
              })
              .join("") +
            "</optgroup>"
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
      payOptions +
      "</select>" +
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
      var mode = document.getElementById("pay-mode").value;
      addToCartFromMode(product, mode, qty);
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

  function addToCartFromMode(product, mode, qty) {
    if (mode === "contado") {
      addToCart(product, "Contado", Number(product.precio_contado), qty);
      return;
    }
    var parts = mode.split("|");
    var planKey = parts[0];
    var freqLabel = parts[1];
    var plans = planBreakdown(product);
    var plan = plans.filter(function (pl) {
      return pl.key === planKey;
    })[0];
    if (!plan) return;
    var row = plan.rows.filter(function (r) {
      return r.freqLabel === freqLabel;
    })[0];
    var modeLabel =
      plan.label + " - " + freqLabel + " (" + row.cuotas + " cuotas de " + money(row.cuotaValor) + ")";
    addToCart(product, modeLabel, plan.total, qty);
  }

  // ---------- carrito ----------

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

  function addToCart(product, modeLabel, unitPrice, qty) {
    var existing = state.cart.filter(function (item) {
      return item.productId === product.id_producto && item.modeLabel === modeLabel;
    })[0];

    if (existing) {
      existing.qty += qty;
    } else {
      state.cart.push({
        productId: product.id_producto,
        nombre: product.nombre_producto,
        sku: product.sku_producto,
        foto: photoUrl(product),
        modeLabel: modeLabel,
        unitPrice: unitPrice,
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

  function cartTotal() {
    return state.cart.reduce(function (sum, item) {
      return sum + item.unitPrice * item.qty;
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
            escapeHtml(item.modeLabel) +
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
            money(item.unitPrice * item.qty) +
            "</div>" +
            "</div>"
          );
        })
        .join("");
    }

    els.cartTotal.textContent = money(cartTotal());
    els.cartCheckout.disabled = state.cart.length === 0;
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
      lines.push(
        (i + 1) +
          ") " +
          item.nombre +
          " (SKU: " +
          (item.sku || "-") +
          ") - Cant: " +
          item.qty +
          " - " +
          item.modeLabel +
          " - Subtotal: " +
          money(item.unitPrice * item.qty)
      );
    });
    lines.push("");
    lines.push("Total: " + money(cartTotal()));
    return lines.join("\n");
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
      if (p2) addToCart(p2, "Contado", Number(p2.precio_contado), 1);
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
    })
    .catch(function (err) {
      console.error(err);
      els.errorState.hidden = false;
      els.resultsCount.textContent = "";
    });
})();
