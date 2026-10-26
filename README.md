# PlanHogar — Catálogo online

Catálogo de productos para [planhogar.com.ar](https://planhogar.com.ar/), con filtros, carrito y pedido por WhatsApp. Sitio 100% estático: HTML + CSS + JS sin frameworks ni build (no hay `npm install`, no hay servidor propio — se abre directo o se sube a cualquier hosting estático).

## Archivos

```
index.html   estructura de la página (header, filtros, grilla, modales, carrito)
styles.css   estilos (una sola paleta de color vía variables CSS)
app.js       toda la lógica: fetch de productos, filtros, carrito, PDF, WhatsApp
logo.png     logo extraído de Logo_Plan_Hogar_plantillas.pdf
vendor/      jsPDF + AutoTable (generación del PDF del pedido)
```

No hay `package.json` ni build. La única dependencia es jsPDF (+ AutoTable) para el PDF, copiada en `vendor/` y servida tal cual.

## Cómo probarlo local

Cualquier servidor estático sirve. Por ejemplo:

```bash
cd planhogar
python3 -m http.server 8080
# abrir http://localhost:8080
```

También funciona abriendo `index.html` directo con doble clic (el catálogo llama a la API externa, no depende de un backend propio).

## De dónde salen los datos

Todo el catálogo sale de una sola llamada a:

```
https://api.planhogar.com.ar/index.php?route=prod&limit=5000
```

(`app.js`, constante `API_URL`). El `limit=5000` trae todo el catálogo de una vez (~2600 productos a la fecha) porque la API no pagina de forma incremental utilizable desde el frontend; se filtra/pagina todo en el navegador.

Las fotos salen de `https://api.planhogar.com.ar/uploads/` + el campo `foto_producto` (constante `IMG_BASE`). Si un producto no tiene foto, se usa un ícono de casa genérico (SVG inline, `PLACEHOLDER_IMG`).

Campos de la API que se usan: `id_producto`, `sku_producto`, `nombre_producto`, `precio_contado`, `precio_plan_1/2/3`, `foto_producto`, `id_rubro`/`rubro`, `id_etiqueta`/`nombre_etiqueta`, `nombre_estado_producto` (se ocultan los productos en estado `"Inactivo"`), `cantidadFinal` (stock: "Disponible: N" o "Sin stock" si es 0 o negativo).

## Planes de financiación

La API solo da 3 montos totales por producto (`precio_plan_1/2/3`). Todo lo demás (meses, frecuencias, cantidad de cuotas) es lógica del sitio, definida en `app.js`:

```js
PLAN_DEFS = [
  precio_plan_1 -> "Plan 1", 4 meses
  precio_plan_2 -> "Plan 2", 7 meses
  precio_plan_3 -> "Plan 3", 10 meses
  plan_casa     -> "Plan de la casa", 10 meses (mismo monto que Plan 3, solo cambia el nombre)
]

FRECUENCIAS = [
  Mensual   → cuotas = meses × 1
  Quincenal → cuotas = meses × 2
  Semanal   → cuotas = meses × 4
  Diario    → cuotas = meses × 25
]
```

El monto de cada cuota es `precio_plan_X / cantidad_de_cuotas`, redondeado.

**El plan de pago es único por carrito**, no por producto: se elige una sola vez desde "Elegir plan y fecha" y se aplica a todos los ítems (cada uno sigue cobrando según su propio `precio_plan_X`, pero con la misma frecuencia/fecha).

## Fechas de cuotas

La fecha de inicio la elige el cliente (no se asume "hoy"). A partir de esa fecha:

- **Diario**: cobra de lunes a sábado (nunca domingo).
- **Semanal / Quincenal**: repite siempre el mismo día de la semana.
- **Mensual**: repite siempre el mismo día del mes (si ese día no existe en un mes dado, se usa el último día del mes).
- **Regla general**: si una fecha calculada cae domingo, se corre al lunes siguiente. Para mensual esto se chequea mes a mes (un mismo día del mes puede caer domingo en un mes y no en otro).

Funciones clave en `app.js`: `shiftSunday`, `scheduleTextFromDate` (texto descriptivo), `generateDueDates` (lista completa de fechas, una por cuota, usada en el PDF).

## Carrito y checkout

- El carrito persiste en `localStorage` (`ph_cart_v3`): ítems + plan elegido + fecha elegida.
- **"Finalizar pedido por WhatsApp"**: arma un mensaje de texto con el detalle (producto, cantidad, forma de pago, subtotal, cronograma, total) y abre `https://wa.me/<numero>?text=...`. El número está hardcodeado en `WHATSAPP_NUMBER` (`app.js`).
- **"Descargar PDF del pedido"**: genera un archivo `.pdf` real con [jsPDF](https://github.com/parallax/jsPDF) 2.5.1 + [jsPDF-AutoTable](https://github.com/simonbengtsson/jsPDF-AutoTable) 3.8.2 (copiados en `vendor/`, sin CDN; se cargan recién al tocar el botón) y lo descarga directo como `pedido-planhogar-<fecha>-<cliente>.pdf`. *Importante:* un link de WhatsApp (`wa.me`) no puede adjuntar archivos, así que el cliente adjunta el PDF a mano en el chat.
- El PDF incluye una planilla de seguimiento de cuotas (una fila por cuota, con fecha y monto precargados, y columnas en blanco para "Fecha pagado", "Pagado $" y "Firma") cuando el modo elegido no es contado.

## Links compartibles y vendedores

- **Link de producto**: botón "Compartir producto" en el detalle. Genera `?p=<código>` (ej. `?p=2w7g4`); al abrirlo se muestra ese producto.
- **Link de carrito**: botón "Compartir link del carrito". Genera `?c=<token>` (JSON en base64url con ítems, plan, fecha y vendedor); al abrirlo se carga ese carrito (si el visitante ya tenía uno, se le pregunta si lo reemplaza). Después de aplicarlo se limpia la URL.
- Los ids van ofuscados (`encodeId`/`decodeId` en `app.js`) para que el link no muestre ids correlativos. No es encriptación: la lógica está en el JS público y los ids igual salen en la API. Si se cambian `ID_MULT`/`ID_OFFSET`/`ID_XOR`, los links ya compartidos dejan de funcionar.
- En el celular se usa el menú nativo de compartir; en la compu se copia el link al portapapeles.
- **Vendedor**: selector en el carrito, cargado de `https://api.planhogar.com.ar/index.php?route=vendedores` (`VENDEDORES_URL`; empleados activos con rol Vendedor o Cobrador, `id_rol_empleado` 5 y 6; el endpoint devuelve solo nombre y celular). Si esa ruta no responde, se usa `route=emp` (`EMPLEADOS_URL`) filtrando en el navegador. El pedido por WhatsApp va al celular del vendedor elegido; sin vendedor va a `WHATSAPP_NUMBER`. Si el endpoint falla, el selector se oculta y todo sigue andando con el número general.
- El mensaje de WhatsApp puede incluir el link del carrito (casilla "Incluir link del carrito en el mensaje").

## Datos del cliente

En el carrito, bloque "Tus datos": nombre completo, DNI (7 u 8 dígitos) o CUIT/CUIL (11 dígitos, con guiones automáticos y validación del dígito verificador; el campo solo acepta números), dirección escrita y/o ubicación GPS ("Usar mi ubicación actual", genera un link de Google Maps), y descripción opcional. Nombre, DNI y dirección-o-ubicación son obligatorios para enviar por WhatsApp o descargar el PDF; si falta algo se muestra un aviso y se marca el campo. Los datos van en el mensaje de WhatsApp y en el PDF.

Se guardan en `localStorage` (`ph_cliente_v1`), aparte del carrito, para no recargarlos en cada pedido. **Nunca** se incluyen en el link compartido del carrito. La ubicación GPS solo funciona en HTTPS (o `localhost`).

## Cosas para cambiar a mano si hace falta

Todas están al principio de `app.js` o en `:root` de `styles.css`:

| Qué | Dónde |
|---|---|
| Número de WhatsApp | `WHATSAPP_NUMBER` en `app.js` |
| Endpoint de la API | `API_URL` en `app.js` |
| Base de imágenes | `IMG_BASE` en `app.js` |
| Meses/nombres de los planes | `PLAN_DEFS` en `app.js` |
| Multiplicadores de frecuencia | `FRECUENCIAS` en `app.js` |
| Colores del sitio | `:root` en `styles.css` (`--color-primary`, etc.) |
| Cuántos productos se muestran por tanda | `PAGE_SIZE` en `app.js` |

## Deploy

Son archivos estáticos — se suben tal cual a cualquier hosting (el mismo que sirve planhogar.com.ar, Netlify, GitHub Pages, etc.). No requieren build ni variables de entorno. Requisito: que la API (`api.planhogar.com.ar`) siga respondiendo con CORS abierto (`Access-Control-Allow-Origin: *`), como está hoy.

## Repo

https://github.com/K-lebjolicoeur/Planhogarweb
