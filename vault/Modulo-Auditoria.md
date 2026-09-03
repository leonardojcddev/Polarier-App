# Módulo de Auditoría

Sistema de **control de almacén hotelero** mediante formularios diarios nativos. Diseñado multi-hotel desde el inicio (preparado para polos turísticos). Ver [[Referencias-Formularios]] para el mapeo con los Excel originales.

## Concepto

Un usuario **auditor** entra en la app y ve **solo** su mundo (sin chat/documentos): rellena formularios diarios de control y consulta su histórico. Los datos se guardan en Supabase; en una fase posterior se generará un informe PDF (vía n8n + pythonrunner) que se enviará por WhatsApp/email.

## Acceso y roles

- Tabla `user_hotel_roles` (rol `auditor`/`supervisor`/`admin` por hotel).
- `RoleContext` (`src/context/RoleContext.tsx`) carga los roles del usuario.
- Un **auditor puro** (solo rol auditor) es redirigido a `/auditoria` y no puede entrar al chat (`NonAuditorGate` + `AuditorRoute` en `App.tsx`).
- RLS en Supabase: cada auditor solo ve/gestiona **sus** submissions, en su hotel.

## Navegación (layout propio)

`AuditLayout` con sidebar reducido: **Dashboard** (`/auditoria`), **Formularios de Control** (`/auditoria/formularios`) e **Histórico** (`/auditoria/historico`). Muestra el hotel activo.

**Pantalla de inicio:** `/auditoria` es el **dashboard**. Un auditor puro que inicia sesión cae en `/lobby`, y `NonAuditorGate` lo redirige a `/auditoria`, así que el dashboard es lo primero que ve. (Una cuenta con rol auditor *y además* otro rol sigue entrando por el lobby: tiene chat.)

## Formularios (3 tipos)

| Tipo | Layout | Componente |
|------|--------|-----------|
| `lenceria` | matriz ubicación × prenda, totales fila/columna en vivo | `LenceriaMatrix.tsx` |
| `produccion` | layout **vales**: bloques de vale (añadir/quitar), cada uno con 10 prendas fijas × columnas agrupadas + Total P+M+R, cabecera | `ValesForm.tsx` |
| `cuadrador` | layout **categorias**: 5 categorías fijas, cada una con líneas dinámicas (Vale, Declaración, Producción, Faltantes, Pendientes, Observaciones) | `CategoriasForm.tsx` |

El tipo y las columnas de cada formulario se definen en `form_definitions.config` (jsonb), así que **añadir/cambiar un formulario no requiere migración de esquema**.

**Responsive:** en escritorio/tablet (≥1024px) se muestran como **tabla**; en móvil (<1024px) cada fila (ubicación o vale) se renderiza como **tarjeta vertical** con los campos apilados, evitando el scroll horizontal. La tabla nunca rompe el layout de la página (`overflow-x-auto` + columna fija `sticky`).

**Estilo de cabeceras:** la fila de nombres de columna de todas las tablas usa la utilidad `.tbl-head` (en `src/index.css`): **modo claro → fondo dorado (accent) + texto negro; modo oscuro → azul + texto claro**. Separadores de columna con `.tbl-head-sep`.

## Modelo de datos (Supabase)

Ver [[Supabase]] para el detalle. Tablas: `polos_turisticos`, `hoteles`, `user_hotel_roles`, `catalogo_prendas`, `catalogo_ubicaciones`, `form_definitions`, `form_submissions`.

- `form_submissions` guarda una entrega diaria: `data` (jsonb con los valores), `totales` (jsonb), y clave única `(hotel_id, form_definition_id, fecha, user_id)` → **un formulario por día**.
- `data` según el tipo:
  - lencería: `{ [ubicacionId]: { [prendaId]: number } }`
  - producción/cuadrador: `{ lineas: [{ id, prenda, valores:{...}, observaciones? }] }`

SQL: `supabase/migrations/001_audit_module.sql` (base), `002_forms_produccion_cuadrador.sql` (defs producción/cuadrador) y `003_polos_turisticos.sql` (polos + vínculo del hotel).

**Polos turísticos:** existen los 6 (La Habana, Varadero, Caibarién, Cayo Coco, Cayo Cruz, Holguín). Solo **La Habana** tiene hotel (Gran Muthu Habana); los demás están vacíos, listos para crecer. Ojo: la RLS solo hace visible un polo si el usuario accede a algún hotel suyo, así que los polos sin hoteles no aparecen aún en la app.

## Estructura de código

```
src/services/audit.ts        ← catálogos, definiciones, submissions (CRUD)
src/services/hotels.ts       ← hoteles y roles del usuario
src/context/RoleContext.tsx  ← rol/hotel activo
src/components/audit/
  AuditLayout.tsx            ← layout del auditor (sidebar sin chat)
  LenceriaMatrix.tsx         ← matriz de lencería
  LineasTable.tsx            ← tabla de líneas por vale (producción/cuadrador)
  DashboardControl.tsx       ← dashboard por hotel y mes (recharts)
src/lib/dashboard.ts         ← lógica del dashboard (series, acumulado, alertas)
src/pages/audit/
  AuditDashboard.tsx         ← inicio del auditor (/auditoria)
  AuditHome.tsx              ← formularios del día (/auditoria/formularios)
  AuditForm.tsx              ← rellena un formulario (render por tipo)
  AuditHistory.tsx           ← histórico (entra al formulario, descarga PDF)
```

## Histórico

- Lista las submissions del usuario (más recientes primero) con fecha y total.
- **Clic en una entrada abre el formulario:** si es de hoy → editable; si es de un día pasado → **solo lectura** (`?fecha=YYYY-MM-DD`).
- Botón de **ver informe**: abre la vista previa del informe y permite descargar el PDF.

## Dashboard de control (pantalla de inicio del auditor)

`/auditoria` → `AuditDashboard.tsx`, que solo monta `DashboardControl`. Un dashboard por **hotel** y por **mes**, siempre con **datos reales** de Supabase (no hay datos de ejemplo en el código).

- **Idea de fondo:** las tablas son acumulativas. El mes empieza en 0 y debe terminar con toda la **dotación del hotel** (total de prendas) lavada. El dashboard mide ese avance.
- **De dónde sale la dotación:** del formulario de **lencería** (el conteo de inventario más alto del mes, `totales.general`). Si no hay lencería rellenada, se puede fijar a mano en el filtro "Dotación del hotel" y el dashboard lo explica en vez de inventarse un objetivo.
- **Fuente del acumulado:** el formulario de producción con más días registrados (Control de Producción o Cuadrador Lavatín); se puede cambiar con un selector.
- **Qué muestra:** KPIs (avance %, día típico, cierre previsto, días registrados), barra de avance con marca del *ritmo ideal de hoy*, gráfica de **acumulado vs. ritmo ideal vs. dotación**, gráfica de **producción diaria** con barras coloreadas por desviación, y comparativa de líneas por formulario.
- **Avisos ("Qué vigilar"):** cada día se compara con la **mediana** de los días con producción del mes (no la media: así un día raro no arrastra el umbral; hacen falta ≥3 días para tener referencia). Umbrales: <75 % → aviso, <50 % → prioridad alta, >150 % → pico. También avisa de días pasados **sin parte**, de partes en **borrador** y de si el **ritmo global no llega** a la dotación. Cada aviso trae explicación en lenguaje llano + "qué revisar"; al pulsarlo se selecciona el día y se puede abrir el formulario de esa fecha.
- **Identidad visual:** el mismo lenguaje que el informe (`InformePreview`): banda de cabecera azul marino con el **logo Polarier** y filete dorado, franjas de sección azules con icono dorado, filete dorado en las tarjetas de KPI y gráficas en azul primario + dorado (`accent`). Las barras del día: azul = normal, naranja = por debajo, rojo = muy por debajo, **dorado = pico**. Utilidades `.polarier-band` y `.polarier-head` en `src/index.css` (junto a `.tbl-head`): fijan el azul de marca en **ambos temas**, porque los tokens `--sidebar-bg`/`--primary` viran demasiado en oscuro y la cabecera se perdía contra el fondo.
- **Código:** `src/lib/dashboard.ts` (lógica pura: series, acumulado, alertas) + `src/components/audit/DashboardControl.tsx` (vista, recharts). Tests en `src/test/dashboard.test.ts` y `src/test/DashboardControl.test.tsx`.
- Lee `totales` de cada submission, así que **no hace falta migración**: cuadrador → `prenda`/`kg`, vales/líneas → `porColumna.produccion`, lencería → `general`.

## Informe (PDF en cliente)

El informe se genera **en el navegador**, sin depender de n8n, así que está disponible en cualquier momento.

- `src/lib/informe.ts` — lógica pura: convierte una `FormSubmission` + su `FormDefinition` (+ catálogos para lencería) en una estructura genérica `Informe` (título, datos del parte, tablas con totales). **Única fuente de verdad** para pantalla y PDF.
- `src/components/audit/InformePreview.tsx` — vista previa a pantalla completa (formato Polarier: cabecera azul, columnas doradas, totales azul). Botones **Descargar PDF** y **Enviar por correo**.
- `src/lib/informePdf.ts` — genera el PDF con **jsPDF + jspdf-autotable** (texto vectorial) y lanza la descarga directa. Reproduce el diseño de la vista previa.
- **Accesible desde dos sitios:** el histórico (icono en cada tarjeta) y el formulario abierto (botón "Ver informe"; refleja las ediciones sin guardar).
- **Envío por correo:** `EnviarCorreoModal.tsx` (destinatario/asunto/mensaje) + `src/services/informeCorreo.ts`, que genera el PDF en base64 y hace **POST a un webhook n8n** (`VITE_N8N_EMAIL_WEBHOOK_URL`, instancia `automate-cuba24.app.n8n.cloud`; respeta `VITE_N8N_MODE`). El flujo n8n envía el correo con el PDF adjunto. El remitente lo define la cuenta de n8n; el correo del usuario logueado viaja solo como referencia (Supabase Auth no da SMTP del usuario). Payload: `{ para, asunto, mensaje, remitente, informe, adjunto:{filename,mime_type,base64} }`. Falta montar/activar el flujo n8n. Ver [[Integracion-n8n]] y [[Pendientes]].

## Automatización futura (preparada, sin implementar)

`form_submissions` tiene `informe_url`, `informe_estado`, `enviado_at`. Flujo previsto para el **envío**:
generar PDF en cliente → POST a webhook n8n → n8n envía por correo (nodo Email/Gmail, con adjunto) y/o WhatsApp (Evolution API, número fijo) → opcionalmente guarda registro en `form_submissions`. Ver [[Integracion-n8n]] y [[Pendientes]]. (La generación del PDF ya no depende de n8n.)
