(function () {
  "use strict";

  var API_URL = "https://api.planhogar.com.ar/index.php?route=prod&limit=5000";
  var IMG_BASE = "https://api.planhogar.com.ar/uploads/";
  var PAGE_SIZE = 30;
  var VENDEDORES_URL = "https://api.planhogar.com.ar/index.php?route=vendedores";
  // respaldo mientras route=vendedores no esté subido en la API
  var EMPLEADOS_URL = "https://api.planhogar.com.ar/index.php?route=emp&limit=500";
  var VENDEDOR_ROLES = [5, 6]; // id_rol_empleado: Vendedor, Cobrador
  var WHATSAPP_NUMBER = "5493513119444"; // se usa si no se elige vendedor
  var CART_KEY = "ph_cart_v3";
  var CLIENT_KEY = "ph_cliente_v1"; // datos del cliente, aparte del carrito (no viajan en el link)

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
    stockFilter: document.getElementById("stock-filter"),
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
    cartSellerRow: document.getElementById("cart-seller-row"),
    cartSeller: document.getElementById("cart-seller"),
    cartIncludeLink: document.getElementById("cart-include-link"),
    cartShare: document.getElementById("cart-share"),
    cartShareStatus: document.getElementById("cart-share-status"),
    cartSellerHint: document.getElementById("cart-seller-hint"),
    cartClient: document.getElementById("cart-client"),
    clientName: document.getElementById("client-name"),
    clientDni: document.getElementById("client-dni"),
    clientAddress: document.getElementById("client-address"),
    clientNotes: document.getElementById("client-notes"),
    clientGeo: document.getElementById("client-geo"),
    clientGeoStatus: document.getElementById("client-geo-status"),
    clientHint: document.getElementById("client-hint"),
  };

  var state = {
    all: [],
    byId: {},
    filtered: [],
    rendered: 0,
    cart: [], // [{productId, nombre, sku, foto, qty}]
    cartMode: "contado", // "contado" o "planKey|FreqLabel", aplica a TODO el carrito
    startDate: null, // "YYYY-MM-DD" elegida por el usuario, o null
    vendedores: [], // [{id_empleado, nombre_empleado, apellido_empleado, celular_empleado}]
    vendedorId: null, // id_empleado elegido en el carrito, o null (número general)
    vendedoresStatus: "loading", // "loading" | "ok" | "error"
    includeLink: true, // agregar el link del carrito al mensaje de WhatsApp
    cliente: { nombre: "", dni: "", direccion: "", lat: null, lng: null, notas: "" },
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

  // ---------- links compartibles ----------
  // ?p=<código>   abre el detalle de ese producto
  // ?c=<token>    carga ese carrito (ítems + plan + fecha + vendedor)
  //
  // los ids van ofuscados para que el link no muestre ids correlativos.
  // NO es seguridad: es un sitio estático, cualquiera puede leer esta
  // lógica, y los ids igual son públicos en la API.

  var ID_MULT = 7919;
  var ID_OFFSET = 104729;
  var ID_XOR = 0x5a5a5a;

  function encodeId(id) {
    var n = Number(id);
    if (!(n >= 0)) return "";
    return ((n * ID_MULT + ID_OFFSET) ^ ID_XOR).toString(36);
  }

  // devuelve el id como string, o null si el código no es válido
  function decodeId(code) {
    if (!/^[0-9a-z]+$/.test(code || "")) return null;
    var v = (parseInt(code, 36) ^ ID_XOR) - ID_OFFSET;
    if (v < 0 || v % ID_MULT !== 0) return null;
    return String(v / ID_MULT);
  }

  function toBase64Url(str) {
    return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function fromBase64Url(str) {
    var b64 = str.replace(/-/g, "+").replace(/_/g, "/");
    while (b64.length % 4) b64 += "=";
    return decodeURIComponent(escape(atob(b64)));
  }

  function baseUrl() {
    return window.location.href.split(/[?#]/)[0];
  }

  function productLink(product) {
    return baseUrl() + "?p=" + encodeId(product.id_producto);
  }

  function cartLink() {
    var payload = {
      i: state.cart.map(function (item) {
        return [encodeId(item.productId), item.qty];
      }),
    };
    if (state.cartMode !== "contado") payload.m = state.cartMode;
    if (state.startDate) payload.f = state.startDate;
    if (state.vendedorId) payload.v = encodeId(state.vendedorId);
    return baseUrl() + "?c=" + toBase64Url(JSON.stringify(payload));
  }

  function parseCartToken(token) {
    try {
      var data = JSON.parse(fromBase64Url(token));
      return data && Array.isArray(data.i) ? data : null;
    } catch (e) {
      return null;
    }
  }

  function isValidMode(mode) {
    if (mode === "contado") return true;
    var parts = (mode || "").split("|");
    var planOk = PLAN_DEFS.some(function (d) {
      return d.key === parts[0];
    });
    var freqOk = FRECUENCIAS.some(function (f) {
      return f.label === parts[1];
    });
    return planOk && freqOk;
  }

  // menú nativo de compartir en el celular; en la compu copia el link
  function shareUrl(url, title, statusEl) {
    function show(msg) {
      if (!statusEl) return;
      statusEl.textContent = msg;
      statusEl.hidden = false;
      clearTimeout(statusEl._t);
      statusEl._t = setTimeout(function () {
        statusEl.hidden = true;
      }, 3000);
    }

    if (navigator.share) {
      navigator.share({ title: title, url: url }).catch(function () {
        /* el usuario cerró el menú */
      });
      return;
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(url).then(
        function () {
          show("Link copiado. Pegalo donde quieras compartirlo.");
        },
        function () {
          window.prompt("Copiá el link:", url);
        }
      );
      return;
    }
    window.prompt("Copiá el link:", url);
  }

  // abre lo que venga en la URL (producto o carrito compartido) y después
  // limpia la URL para que recargar la página no lo vuelva a aplicar
  function handleIncomingLink() {
    var params = new URLSearchParams(window.location.search);
    var cartParam = params.get("c");
    var productParam = params.get("p");
    if (!cartParam && !productParam) return;

    var cartData = cartParam ? parseCartToken(cartParam) : null;
    var productId = productParam ? decodeId(productParam) : null;

    if (cartData) {
      var items = [];
      cartData.i.forEach(function (entry) {
        var product = state.byId[decodeId(String(entry[0]))];
        var qty = Math.max(1, parseInt(entry[1], 10) || 1);
        if (!product) return;
        items.push({
          productId: product.id_producto,
          nombre: product.nombre_producto,
          sku: product.sku_producto,
          foto: photoUrl(product),
          qty: qty,
        });
      });

      var replace =
        items.length > 0 &&
        (state.cart.length === 0 ||
          window.confirm("Abriste un carrito compartido. ¿Querés reemplazar tu carrito actual por este?"));
      if (replace) {
        var mode = cartData.m || "contado";
        var fecha = cartData.f;
        state.cart = items;
        state.cartMode = isValidMode(mode) ? mode : "contado";
        // una fecha vencida no sirve como inicio de cuotas: se pide de nuevo
        state.startDate =
          state.cartMode !== "contado" && /^\d{4}-\d{2}-\d{2}$/.test(fecha || "") && fecha >= todayISO()
            ? fecha
            : null;
        var vendedorId = cartData.v ? decodeId(String(cartData.v)) : null;
        if (vendedorId) state.vendedorId = vendedorId;
        saveCart();
        renderSellerSelect();
        renderCart();
        openCart();
      }
    } else if (productId && state.byId[productId]) {
      openModal(state.byId[productId]);
    }

    try {
      window.history.replaceState(null, "", baseUrl());
    } catch (e) {
      /* file:// u otro contexto sin history */
    }
  }

  // ---------- vendedores ----------

  function currentVendedor() {
    if (!state.vendedorId) return null;
    return (
      state.vendedores.filter(function (v) {
        return String(v.id_empleado) === String(state.vendedorId);
      })[0] || null
    );
  }

  function vendedorName(v) {
    return ((v.nombre_empleado || "") + " " + (v.apellido_empleado || "")).trim();
  }

  // celular como viene de la base (ej. "351 311-9444", "0351153119444")
  // -> formato internacional para wa.me (549 + área + número). Si el número
  // trae el "15" local después del código de área, hay que corregirlo en la
  // base: acá no se puede saber cuántos dígitos tiene el código de área.
  function normalizeWhatsapp(raw) {
    var d = (raw || "").replace(/\D/g, "");
    if (d.indexOf("00") === 0) d = d.slice(2);
    if (d.indexOf("549") === 0) return d.length >= 12 ? d : null;
    if (d.indexOf("54") === 0) d = d.slice(2);
    if (d.charAt(0) === "0") d = d.slice(1);
    return d.length >= 10 ? "549" + d : null;
  }

  function whatsappTarget() {
    var v = currentVendedor();
    var number = v ? normalizeWhatsapp(v.celular_empleado) : null;
    return { vendedor: v, number: number || WHATSAPP_NUMBER };
  }

  function renderSellerSelect() {
    if (state.vendedores.length === 0) {
      els.cartSellerRow.hidden = true;
      return;
    }
    if (!currentVendedor()) state.vendedorId = null;

    var html = '<option value="" disabled' + (state.vendedorId ? "" : " selected") + ">Seleccioná un vendedor</option>";
    state.vendedores.forEach(function (v) {
      var id = String(v.id_empleado);
      html +=
        '<option value="' +
        escapeHtml(id) +
        '"' +
        (String(state.vendedorId) === id ? " selected" : "") +
        ">" +
        escapeHtml(vendedorName(v)) +
        "</option>";
    });
    els.cartSeller.innerHTML = html;
    els.cartSellerRow.hidden = false;
  }

  function fetchJson(url) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    });
  }

  // route=emp devuelve todos los empleados con datos personales: se filtra
  // acá y se descarta todo menos id, nombre y celular. Es solo un respaldo
  // hasta que esté subido route=vendedores en la API.
  function vendedoresFromEmp(json) {
    var rows = json && json.success === true && Array.isArray(json.data) ? json.data : [];
    return rows
      .filter(function (e) {
        return VENDEDOR_ROLES.indexOf(Number(e.id_rol_empleado)) !== -1 && e.estado === "A" && e.celular_empleado;
      })
      .map(function (e) {
        return {
          id_empleado: e.id_empleado,
          nombre_empleado: e.nombre_empleado,
          apellido_empleado: e.apellido_empleado,
          celular_empleado: e.celular_empleado,
        };
      })
      .sort(function (a, b) {
        return vendedorName(a).localeCompare(vendedorName(b), "es");
      });
  }

  // el vendedor es obligatorio para WhatsApp y PDF: si falta, se avisa al
  // tocar el botón en vez de desactivarlo. Solo si la lista no se pudo
  // cargar se deja pasar con el número general para no bloquear la venta.
  function ensureSeller() {
    if (state.vendedoresStatus === "error" || currentVendedor()) return true;
    els.cartSellerHint.textContent =
      state.vendedoresStatus === "loading"
        ? "Cargando vendedores, esperá un momento..."
        : "Elegí un vendedor para finalizar el pedido o descargar el PDF.";
    els.cartSellerHint.hidden = false;
    els.cartSeller.classList.add("is-missing");
    if (!els.cartSellerRow.hidden) {
      els.cartSellerRow.scrollIntoView({ behavior: "smooth", block: "center" });
      els.cartSeller.focus();
    }
    return false;
  }

  function hideSellerWarning() {
    els.cartSellerHint.hidden = true;
    els.cartSeller.classList.remove("is-missing");
  }

  // ---------- datos del cliente ----------
  // se guardan en este navegador para no volver a cargarlos en cada
  // pedido, pero nunca se ponen en el link compartido del carrito

  function loadClient() {
    try {
      var parsed = JSON.parse(localStorage.getItem(CLIENT_KEY) || "null");
      if (parsed && typeof parsed === "object") {
        Object.keys(state.cliente).forEach(function (k) {
          if (parsed[k] != null) state.cliente[k] = parsed[k];
        });
      }
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }

  function saveClient() {
    try {
      localStorage.setItem(CLIENT_KEY, JSON.stringify(state.cliente));
    } catch (e) {
      /* almacenamiento no disponible */
    }
  }

  function mapsLink() {
    var c = state.cliente;
    if (c.lat == null || c.lng == null) return null;
    return "https://www.google.com/maps?q=" + c.lat + "," + c.lng;
  }

  function renderGeoStatus() {
    var link = mapsLink();
    if (!link) {
      els.clientGeoStatus.hidden = true;
      els.clientGeo.textContent = "📍 Usar mi ubicación actual";
      return;
    }
    els.clientGeoStatus.innerHTML =
      'Ubicación cargada. <a href="' + link + '" target="_blank" rel="noopener">Ver en el mapa</a> · ' +
      '<a href="#" id="client-geo-clear">Quitar</a>';
    els.clientGeoStatus.hidden = false;
    els.clientGeo.textContent = "📍 Actualizar ubicación";
  }

  function fillClientForm() {
    // maxlength no recorta valores guardados antes del límite actual
    state.cliente.nombre = state.cliente.nombre.slice(0, els.clientName.maxLength);
    state.cliente.direccion = state.cliente.direccion.slice(0, els.clientAddress.maxLength);
    state.cliente.notas = state.cliente.notas.slice(0, els.clientNotes.maxLength);
    els.clientName.value = state.cliente.nombre;
    state.cliente.dni = cleanDni(state.cliente.dni);
    els.clientDni.value = formatDoc(state.cliente.dni);
    els.clientAddress.value = state.cliente.direccion;
    els.clientNotes.value = state.cliente.notas;
    renderGeoStatus();
  }

  function requestLocation() {
    if (!navigator.geolocation) {
      els.clientGeoStatus.textContent = "Tu navegador no permite compartir la ubicación. Escribí la dirección.";
      els.clientGeoStatus.hidden = false;
      return;
    }
    els.clientGeo.disabled = true;
    els.clientGeoStatus.textContent = "Buscando tu ubicación...";
    els.clientGeoStatus.hidden = false;
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        state.cliente.lat = Number(pos.coords.latitude.toFixed(6));
        state.cliente.lng = Number(pos.coords.longitude.toFixed(6));
        saveClient();
        els.clientGeo.disabled = false;
        els.clientAddress.classList.remove("is-missing");
        renderGeoStatus();
      },
      function (err) {
        els.clientGeo.disabled = false;
        els.clientGeoStatus.textContent =
          err.code === 1
            ? "No diste permiso para ver tu ubicación. Podés habilitarlo en el navegador o escribir la dirección."
            : "No se pudo obtener tu ubicación. Probá de nuevo o escribí la dirección.";
        els.clientGeoStatus.hidden = false;
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 }
    );
  }

  function cleanDni(value) {
    return (value || "").replace(/\D/g, "").slice(0, 11);
  }

  // DNI tal cual (12345678); CUIT/CUIL con guiones (20-12345678-9)
  function formatDoc(digits) {
    if (digits.length <= 8) return digits;
    return digits.slice(0, 2) + "-" + digits.slice(2, 10) + (digits.length > 10 ? "-" + digits.slice(10) : "");
  }

  function docLabel(digits) {
    return digits.length === 11 ? "CUIT/CUIL" : "DNI";
  }

  // dígito verificador de CUIT/CUIL (módulo 11)
  function isValidCuit(digits) {
    if (!/^\d{11}$/.test(digits)) return false;
    var weights = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    var sum = 0;
    for (var i = 0; i < 10; i++) sum += Number(digits.charAt(i)) * weights[i];
    var check = 11 - (sum % 11);
    if (check === 11) check = 0;
    if (check === 10) return false;
    return check === Number(digits.charAt(10));
  }

  // null si es válido, o el texto del problema
  function docProblem(digits) {
    if (digits.length === 7 || digits.length === 8) return null;
    if (digits.length === 11) return isValidCuit(digits) ? null : "CUIT/CUIL inválido, revisá los números";
    return "DNI (8 números) o CUIT/CUIL (11 números)";
  }

  // nombre, DNI y (dirección o ubicación) son obligatorios; si falta algo
  // se avisa, se marca el campo y se lleva el foco al primero que falta
  function ensureClient() {
    var c = state.cliente;
    var missing = [];
    var dni = cleanDni(c.dni);
    if (c.nombre.trim().split(/\s+/).length < 2) missing.push([els.clientName, "nombre y apellido"]);
    var docError = docProblem(dni);
    if (docError) missing.push([els.clientDni, docError]);
    if (!c.direccion.trim() && !mapsLink()) missing.push([els.clientAddress, "dirección o ubicación"]);

    [els.clientName, els.clientDni, els.clientAddress].forEach(function (el) {
      el.classList.remove("is-missing");
    });
    if (missing.length === 0) {
      els.clientHint.hidden = true;
      return true;
    }
    missing.forEach(function (m) {
      m[0].classList.add("is-missing");
    });
    els.clientHint.textContent =
      "Completá tus datos: " +
      missing
        .map(function (m) {
          return m[1];
        })
        .join(", ") +
      ".";
    els.clientHint.hidden = false;
    missing[0][0].scrollIntoView({ behavior: "smooth", block: "center" });
    missing[0][0].focus({ preventScroll: true });
    return false;
  }

  function clientLines() {
    var c = state.cliente;
    var doc = cleanDni(c.dni);
    var lines = ["Cliente: " + c.nombre.trim(), docLabel(doc) + ": " + formatDoc(doc)];
    if (c.direccion.trim()) lines.push("Dirección: " + c.direccion.trim());
    if (mapsLink()) lines.push("Ubicación: " + mapsLink());
    if (c.notas.trim()) lines.push("Descripción: " + c.notas.trim());
    return lines;
  }

  function loadVendedores() {
    return fetchJson(VENDEDORES_URL)
      .then(
        function (json) {
          if (!json || json.success !== true || !Array.isArray(json.data)) throw new Error("Respuesta inesperada");
          return json.data;
        },
        function () {
          return fetchJson(EMPLEADOS_URL).then(vendedoresFromEmp);
        }
      )
      .then(function (list) {
        state.vendedores = list;
        state.vendedoresStatus = list.length > 0 ? "ok" : "error";
      })
      .catch(function (err) {
        // sin vendedores el carrito sigue funcionando con el número general
        console.warn("No se pudieron cargar los vendedores", err);
        state.vendedores = [];
        state.vendedoresStatus = "error";
      })
      .then(function () {
        renderSellerSelect();
        renderCart();
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

  // ---------- stock ----------
  // cantidadFinal viene de la API; los negativos (ajustes de stock) se
  // muestran como sin stock

  function stockOf(p) {
    return Math.max(0, parseInt(p.cantidadFinal, 10) || 0);
  }

  function stockHtml(p, cls) {
    var n = stockOf(p);
    return n > 0
      ? '<p class="' + cls + '">Disponible: ' + n + "</p>"
      : '<p class="' + cls + ' is-out">Sin stock</p>';
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
      stockHtml(p, "stock") +
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
    var soloDisponibles = els.stockFilter.value === "disponible";

    state.filtered = state.all.filter(function (p) {
      if (rubro && String(p.id_rubro) !== rubro) return false;
      if (etiqueta && String(p.id_etiqueta) !== etiqueta) return false;
      if (soloDisponibles && stockOf(p) === 0) return false;
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
    els.stockFilter.value = "";
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
      stockHtml(product, "stock") +
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
      '<button type="button" id="modal-share" class="btn-pdf">Compartir producto</button>' +
      '<p id="modal-share-status" class="share-status" role="status" hidden></p>' +
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
    document.getElementById("modal-share").addEventListener("click", function () {
      shareUrl(productLink(product), product.nombre_producto, document.getElementById("modal-share-status"));
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
        state.vendedorId = parsed.vendedorId || null;
        state.includeLink = parsed.includeLink !== false;
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
        JSON.stringify({
          items: state.cart,
          mode: state.cartMode,
          startDate: state.startDate,
          vendedorId: state.vendedorId,
          includeLink: state.includeLink,
        })
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
    var vendedor = currentVendedor();
    var needsDate = !!freqLabel && !state.startDate;
    els.cartCheckout.disabled = state.cart.length === 0 || needsDate;
    els.cartPdf.disabled = state.cart.length === 0 || needsDate;
    els.cartShare.disabled = state.cart.length === 0;
    els.cartIncludeLink.checked = state.includeLink;
    if (vendedor) hideSellerWarning();
    els.cartClient.hidden = state.cart.length === 0;

    els.cartCheckout.textContent = vendedor
      ? "Enviar pedido a " + (vendedor.nombre_empleado || "vendedor") + " por WhatsApp"
      : "Finalizar pedido por WhatsApp";
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
    var vendedor = currentVendedor();
    var greeting = vendedor ? "Hola " + (vendedor.nombre_empleado || "") + "!" : "Hola!";
    var lines = [greeting + " Quiero hacer este pedido:", ""]
      .concat(clientLines())
      .concat(["", "Forma de pago: " + genericModeLabel(state.cartMode)]);
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
    if (state.includeLink) {
      lines.push("");
      lines.push("Ver carrito: " + cartLink());
    }
    return lines.join("\n");
  }

  // ---------- PDF del pedido ----------
  // se genera un archivo .pdf real con jsPDF (vendor/, se carga recién al
  // tocar el botón) y se descarga directo. Un link de wa.me no puede
  // adjuntar archivos, así que el cliente lo adjunta a mano en WhatsApp.

  var PDF_LIBS = ["vendor/jspdf.umd.min.js", "vendor/jspdf.plugin.autotable.min.js"];
  var pdfLibsPromise = null;

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement("script");
      s.src = src;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error("No se pudo cargar " + src));
      };
      document.head.appendChild(s);
    });
  }

  function loadPdfLibs() {
    if (!pdfLibsPromise) {
      // en orden: el plugin de tablas necesita jsPDF cargado
      pdfLibsPromise = loadScript(PDF_LIBS[0])
        .then(function () {
          return loadScript(PDF_LIBS[1]);
        })
        .catch(function (err) {
          pdfLibsPromise = null;
          throw err;
        });
    }
    return pdfLibsPromise;
  }

  // logo como data URL para incrustarlo; si falla (ej. abierto con
  // file://) el PDF sale igual, sin logo
  function loadLogoDataUrl() {
    return fetch("logo.png")
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.blob();
      })
      .then(function (blob) {
        return new Promise(function (resolve) {
          var reader = new FileReader();
          reader.onload = function () {
            resolve(reader.result);
          };
          reader.onerror = function () {
            resolve(null);
          };
          reader.readAsDataURL(blob);
        });
      })
      .catch(function () {
        return null;
      });
  }

  function pdfFileName() {
    var name = normalize(state.cliente.nombre)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    return "pedido-planhogar-" + todayISO() + (name ? "-" + name : "") + ".pdf";
  }

  function buildOrderPdf(logo) {
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF({ unit: "mm", format: "a4" });
    var ORANGE = [247, 148, 29];
    var DARK = [28, 34, 48];
    var MUTED = [107, 114, 128];
    var TINT = [255, 243, 224];
    var left = 14;
    var right = doc.internal.pageSize.getWidth() - 14;
    var bottom = doc.internal.pageSize.getHeight() - 15;
    var y = 15;

    function ensureSpace(h) {
      if (y + h > bottom) {
        doc.addPage();
        y = 15;
      }
    }

    function heading(text) {
      ensureSpace(12);
      y += 4;
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor.apply(doc, ORANGE);
      doc.text(text, left, y);
      y += 6;
    }

    function labelValue(label, value) {
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.setTextColor.apply(doc, DARK);
      var labelText = label + ": ";
      var labelW = doc.getTextWidth(labelText);
      doc.setFont("helvetica", "normal");
      var lines = doc.splitTextToSize(value, right - left - labelW);
      ensureSpace(lines.length * 5);
      doc.setFont("helvetica", "bold");
      doc.text(labelText, left, y);
      doc.setFont("helvetica", "normal");
      doc.text(lines, left + labelW, y);
      y += lines.length * 5;
    }

    // encabezado
    if (logo) doc.addImage(logo, "PNG", left, y - 5, 16, 16);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(20);
    doc.setTextColor.apply(doc, ORANGE);
    doc.text("PlanHogar", left + (logo ? 20 : 0), y + 4);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, MUTED);
    var today = new Date().toLocaleDateString("es-AR", { day: "numeric", month: "long", year: "numeric" });
    doc.text("Pedido del " + today, left + (logo ? 20 : 0), y + 10);
    y += 20;

    var vendedor = currentVendedor();
    if (vendedor) labelValue("Vendedor", vendedorName(vendedor));

    heading("Datos del cliente");
    clientLines().forEach(function (line) {
      var i = line.indexOf(": ");
      var key = line.slice(0, i);
      var val = line.slice(i + 2);
      if (key === "Ubicación") {
        ensureSpace(5);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor.apply(doc, DARK);
        doc.text("Ubicación: ", left, y);
        var w = doc.getTextWidth("Ubicación: ");
        doc.setFont("helvetica", "normal");
        doc.setTextColor(26, 115, 232);
        doc.textWithLink("Ver en Google Maps", left + w, y, { url: val });
        y += 5;
      } else {
        labelValue(key, val);
      }
    });

    heading("Pedido");
    labelValue("Forma de pago", genericModeLabel(state.cartMode));
    var scheduleTxt = currentScheduleText();
    if (scheduleTxt) {
      doc.setFontSize(9);
      var schedLines = doc.splitTextToSize(scheduleTxt, right - left - 6);
      var boxH = schedLines.length * 4.5 + 4;
      ensureSpace(boxH + 2);
      doc.setFillColor.apply(doc, TINT);
      doc.rect(left, y - 3, right - left, boxH, "F");
      doc.setTextColor(201, 111, 0);
      doc.text(schedLines, left + 3, y + 1.5);
      y += boxH + 1;
    }

    doc.autoTable({
      startY: y + 2,
      margin: { left: left, right: 14 },
      head: [["#", "Producto", "Cant.", "Cuota", "Subtotal"]],
      body: state.cart.map(function (item, i) {
        var info = cartLineInfo(item);
        return [
          String(i + 1),
          item.nombre + "\nSKU: " + (item.sku || "-"),
          String(item.qty),
          info.cuotas ? info.cuotas + " cuotas de " + money(info.cuotaValor) + " c/u" : "Pago único",
          money(info.unitPrice * item.qty),
        ];
      }),
      styles: { fontSize: 9, textColor: DARK, lineColor: [227, 229, 234], lineWidth: 0.2, valign: "top" },
      headStyles: { fillColor: TINT, textColor: DARK, fontStyle: "bold" },
      columnStyles: { 0: { cellWidth: 8 }, 2: { cellWidth: 14, halign: "center" }, 4: { halign: "right" } },
    });
    y = doc.lastAutoTable.finalY + 8;

    ensureSpace(8);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor.apply(doc, DARK);
    doc.text("Total: " + money(cartTotal()), right, y, { align: "right" });
    y += 6;

    // planilla de seguimiento de cuotas: una fila por cuota con fecha de
    // vencimiento + monto total pre-cargados, y columnas en blanco para
    // que el cobrador anote lo pagado y la firma
    var freqLabel = currentFreqLabel();
    if (freqLabel && state.startDate) {
      var cuotasCount = cartLineInfo(state.cart[0]).cuotas || 0;
      var montoPerCuota = state.cart.reduce(function (sum, item) {
        return sum + (cartLineInfo(item).cuotaValor || 0);
      }, 0);
      var dueDates = generateDueDates(freqLabel, shiftSunday(parseISODate(state.startDate)), cuotasCount);

      heading("Planilla de cuotas");
      doc.autoTable({
        startY: y,
        margin: { left: left, right: 14 },
        head: [["Nº", "Fecha de pago", "Monto", "Fecha pagado", "Pagado $", "Firma"]],
        body: dueDates.map(function (d, idx) {
          return [String(idx + 1), formatDateLong(d), money(montoPerCuota), "", "", ""];
        }),
        styles: { fontSize: 9, textColor: DARK, lineColor: DARK, lineWidth: 0.2, minCellHeight: 8, valign: "middle" },
        headStyles: { fillColor: TINT, textColor: DARK, fontStyle: "bold" },
        columnStyles: { 0: { cellWidth: 10 } },
        rowPageBreak: "avoid",
      });
    }

    return doc;
  }

  function downloadOrderPdf() {
    if (state.cart.length === 0) return;
    var btn = els.cartPdf;
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Generando PDF...";

    Promise.all([loadPdfLibs(), loadLogoDataUrl()])
      .then(function (res) {
        buildOrderPdf(res[1]).save(pdfFileName());
      })
      .catch(function (err) {
        console.error(err);
        alert("No se pudo generar el PDF. Revisá la conexión y probá de nuevo.");
      })
      .then(function () {
        btn.textContent = label;
        renderCart();
      });
  }

  // ---------- eventos ----------

  els.search.addEventListener("input", debounce(applyFilters, 250));
  els.rubro.addEventListener("change", applyFilters);
  els.etiqueta.addEventListener("change", applyFilters);
  els.stockFilter.addEventListener("change", applyFilters);
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
    if (!ensureSeller() || !ensureClient()) return;
    var msg = buildWhatsappMessage();
    var url = "https://wa.me/" + whatsappTarget().number + "?text=" + encodeURIComponent(msg);
    window.open(url, "_blank", "noopener");
  });
  els.cartPdf.addEventListener("click", function () {
    if (!ensureSeller() || !ensureClient()) return;
    downloadOrderPdf();
  });
  [
    [els.clientName, "nombre"],
    [els.clientAddress, "direccion"],
    [els.clientNotes, "notas"],
  ].forEach(function (pair) {
    pair[0].addEventListener("input", function () {
      state.cliente[pair[1]] = pair[0].value;
      pair[0].classList.remove("is-missing");
      saveClient();
    });
  });
  // solo números: las letras y símbolos se descartan al escribir/pegar y
  // los guiones del CUIT/CUIL se ponen solos
  els.clientDni.addEventListener("input", function () {
    var digits = cleanDni(els.clientDni.value);
    els.clientDni.value = formatDoc(digits);
    state.cliente.dni = digits;
    els.clientDni.classList.remove("is-missing");
    saveClient();
  });
  els.clientGeo.addEventListener("click", requestLocation);
  els.clientGeoStatus.addEventListener("click", function (evt) {
    if (evt.target.id !== "client-geo-clear") return;
    evt.preventDefault();
    state.cliente.lat = null;
    state.cliente.lng = null;
    saveClient();
    renderGeoStatus();
  });
  els.cartShare.addEventListener("click", function () {
    if (state.cart.length === 0) return;
    shareUrl(cartLink(), "Mi carrito PlanHogar", els.cartShareStatus);
  });
  els.cartSeller.addEventListener("change", function () {
    state.vendedorId = els.cartSeller.value || null;
    saveCart();
    renderCart();
  });
  els.cartIncludeLink.addEventListener("change", function () {
    state.includeLink = els.cartIncludeLink.checked;
    saveCart();
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
      closePlanModal();
    }
  });

  // ---------- carga inicial ----------

  loadCart();
  loadClient();
  fillClientForm();
  renderCart();
  loadVendedores();

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
      handleIncomingLink();
    })
    .catch(function (err) {
      console.error(err);
      els.errorState.hidden = false;
      els.resultsCount.textContent = "";
    });
})();
