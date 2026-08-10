# Referencias de Formularios

Control de versiones funcional: qué Excel original sirvió de referencia, qué módulo de la app lo representa, y las diferencias entre el original y la implementación. Al evolucionar los formularios, **actualizar esta nota**. Ver [[Modulo-Auditoria]].

> Los tres archivos originales son plantillas rellenadas a mano. El nombre "Agosto" del de lencería solo indicaba el mes; el sistema en la app es **diario** y se adapta al mes automáticamente.

---

## 1. Control de Lencería

- **Archivo original:** `CONTROL LENCERÍA MUTHU AGOSTO.xlsx`
- **Módulo:** formulario tipo `lenceria` → `LenceriaMatrix.tsx`
- **Estructura original:** 31 hojas (una por día del mes). Cada hoja = matriz **Ubicación (filas) × Prenda (columnas)** con totales de fila y columna.
  - Ubicaciones: Lavandería, Alm. Sucio, Alm. Limpio, Piso 24, Office 24, Piso 25, Office 25, Piso 26, Office 26, Spa-1, Spa-2.
  - Prendas: Sábana personal, Sábana king, Fundas, Toalla baño, Toalla mano, Alfombrín, Toallas faciales, Toalla piscina.
- **Diferencias con la app:**
  - Una hoja por día → **una submission por día** (tabla `form_submissions`, no 31 pestañas).
  - Totales calculados **en vivo** en el frontend (no fórmulas de Excel).
  - Ubicaciones y prendas vienen de catálogos en BD (`catalogo_ubicaciones`, `catalogo_prendas`), no fijas en la hoja → editables sin tocar código.
  - Rediseño visual Polarier (cabecera azul, totales dorados), responsive.

---

## 2. Control de Producción

- **Archivo original:** `Modelo Producción.xlsx` (hoja "Control de Producción")
- **Módulo:** formulario tipo `produccion` → `LineasTable.tsx`
- **Estructura original:** cabecera (Fecha, Turno, Operario, Área, Equipo, Jefe de Turno) + filas por **vale/prenda** con columnas: Cantidades Declaración Jurada (Inicio/Fin), Producción (P), Manchas por color (Rosa/Amarilla, Negra, Óxido, Varias) = (M), Roturas (R), Total (P+M+R), Faltante/Sobrante, Pendientes. 8 prendas fijas repetidas en bloques.
- **Modelo real (layout `vales`):** la unidad es el **vale**. Cada vale es un **bloque que contiene las 10 prendas fijas**, y por cada prenda se registran sus columnas de datos. Los vales pueden **añadirse/quitarse** (varían según el día).
  - Config en `form_definitions.config`: `layout:'vales'`, `prendas:[10]`, `grupos:[columnas]`, `cabecera:[campos]`.
  - Datos guardados: `{ cabecera:{...}, vales:[{ id, nombre, prendas:[{prenda, valores:{...}}] }] }`.
- **10 prendas fijas** (catálogo cerrado, nombre no editable): las 8 originales + **Mantelería** + **Servilleta** (estas dos añadidas respecto al Excel original, solo en Producción).
- **Columnas por prenda** (agrupadas 2 niveles, como el Excel): Cant. Dec. Jurada · **Hora** (Inicio, Fin) · Producción (P) · **Manchas (M)** (Rosa/Amarilla, Negra, Óxido, Varias) · Roturas (R) · **Total (P+M+R)** · Faltante/Sobrante · Pendientes.
- **Cabecera** (6 campos del Excel): Fecha (autocompletada), Operario, Jefe de Turno, Turno, Área, Equipo.
- **Total (P+M+R)** calculado automáticamente por prenda (no editable): Producción + suma de las 4 manchas + Roturas.
- Componente: `ValesForm.tsx` (reutiliza tipos/helpers de `LineasTable.tsx`).

---

## 3. Cuadrador Lavatín

- **Archivo original:** `Modelo cuadrador lavatín.xlsx` (hoja "Control de Producción 1 Lavat")
- **Módulo:** formulario tipo `cuadrador` → `LineasTable.tsx`
- **Estructura original:** filas por prenda con columnas: Prenda, Vale, Cantidades en Declaración, Producción, Faltantes/Sobrantes, Pendientes, Observaciones. Categorías: Mantel, Cubremantel, Servilletas, Caminitos, Otros.
- **Modelo real (layout `categorias`):** 5 categorías fijas (Mantel, Cubremantel, Servilletas, Caminitos, Otros) como secciones. **Cada categoría contiene líneas dinámicas** (añadir/quitar), reflejando el espacio del Excel para varios vales por categoría.
  - Config en `form_definitions.config`: `layout:'categorias'`, `categorias:[5]`, `columnas:[...]`.
  - Datos guardados: `{ categorias:[{ nombre, lineas:[{ id, valores:{...} }] }] }`.
  - Columnas por línea (todas las del Excel): **Vale, Cant. en Declaración Jurada, Producción, Faltantes/Sobrantes, Pendientes, Observaciones**.
  - **Cabecera** (añadida, no estaba en el Excel): Fecha, **Turno** (botones Día/Noche), Cuadrador, Encargado Limpio, Jefe de Turno.
  - Cada sección arranca con 1 línea; el usuario añade las que necesite. No se puede quitar la última línea de una categoría.
  - Componente: `CategoriasForm.tsx`.

---

## Notas de mantenimiento

- Las definiciones (columnas, sugerencias) viven en `form_definitions.config` (jsonb) en Supabase. Para cambiar un formulario, se edita esa config (o se crea una nueva `schema_version`), **sin migración de esquema ni normalmente cambios de código**.
- Si un cambio afecta al layout (p.ej. una columna calculada nueva), puede requerir tocar `LineasTable.tsx` / `LenceriaMatrix.tsx`.
