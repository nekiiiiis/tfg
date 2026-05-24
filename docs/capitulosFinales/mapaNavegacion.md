# Mapa de navegación

El SPA construido sobre React + React Router materializa de forma directa los estados y transiciones del [diagrama de contexto](../capitulo2/diagramaDeContexto.md) del capítulo 2. La navegación no es un añadido de la implementación: es el contrato del actor *Usuario* hecho navegable.

## Principio de correspondencia

<div align=center>

||Capítulo 2|Capítulo 4|
|-|-|-|
|Unidad lógica|Estado del sistema (`SISTEMA_DISPONIBLE`, `LEADERBOARD_ABIERTO`…)|Ruta del SPA (`/leaderboard`, `/entidades`, `/entidades/:id`…)|
|Transición|Caso de uso (`CU-XX`)|Acción del usuario sobre un elemento de interfaz (link, botón, formulario)|
|Origen del orden|Diagrama de contexto|`web/src/App.tsx` (rutas declaradas con `react-router-dom`)|

</div>

Cada estado del diagrama de contexto se realiza con **una página** (`web/src/pages/*Page.tsx`). Cada transición se realiza con **una acción** sobre la interfaz que conduce a un endpoint del backend (REST o WS). El recorrido a continuación se ordena tal como lo encuentra el actor *Usuario* al abrir la aplicación.

---

## Punto de entrada

Al abrir el SPA, la ruta raíz redirige automáticamente al *hub* funcional del sistema: el leaderboard. Es el estado `SISTEMA_DISPONIBLE` del diagrama de contexto, materializado como punto de aterrizaje.

```56:65:src/web/src/App.tsx
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/entidades" element={<EntidadesPage />} />
          <Route path="/entidades/:id" element={<EntidadDetailPage />} />
          <Route
            path="/direcciones/:addr"
            element={<DireccionDetailPage />}
          />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="*" element={<Navigate to="/leaderboard" replace />} />
        </Routes>
```

La cabecera global —presente en todas las páginas— expone los tres puntos de acceso a las áreas funcionales (`Leaderboard`, `Entidades`, `Alertas`) junto al indicador de salud del backend. Esa cabecera **es** el conmutador entre las tres ramas principales del diagrama de contexto.

---

## Tres áreas funcionales, tres ramas de navegación

Las tres áreas identificadas en el capítulo 2 (`leaderboard`, `entidades`, `alertas`) se materializan como tres rutas raíz independientes. El criterio RS-05 ("áreas independientes, sin interferencias mutuas") se cumple en la propia estructura del router: ninguna de las tres ramas depende de las otras para abrirse.

<div align=center>

|Estado (cap. 2)|Ruta del SPA|Página|Acceso desde la cabecera|
|-|-|-|-|
|`SISTEMA_DISPONIBLE` *(hub)*|`/` → `/leaderboard`|`LeaderboardPage`|Logo (vuelve al hub) + ítem *Leaderboard*|
|`LEADERBOARD_ABIERTO`|`/leaderboard`|`LeaderboardPage`|Ítem *Leaderboard*|
|`ENTIDADES_ABIERTAS`|`/entidades`|`EntidadesPage`|Ítem *Entidades*|
|`ENTIDAD_ABIERTA`|`/entidades/:id`|`EntidadDetailPage`|Click en una fila de `EntidadesPage`|
|`DIRECCIONES_ABIERTAS` *(sub-contexto)*|`/entidades/:id` *(misma página)*|`EntidadDetailPage` *(sección Direcciones)*|Visible al abrir una entidad|
|*Extensión CU-07* (Detalle global de dirección)|`/direcciones/:addr`|`DireccionDetailPage`|Click en una dirección desde el leaderboard o desde una entidad|
|`ALERTAS_ABIERTAS`|`/alertas`|`AlertasPage`|Ítem *Alertas*|
|`ALERTA_ABIERTA`|`/alertas` *(diálogo `AlertaForm`)*|`AlertaForm` *(modal sobre `AlertasPage`)*|Botón *Nueva alerta* o icono de edición en una fila|

</div>

Las rutas no reconocidas redirigen al *hub* (`<Route path="*" element={<Navigate to="/leaderboard" replace />} />`), garantizando que el actor nunca quede en un estado huérfano.

---

## Rama 1 — Leaderboard (`/leaderboard`)

Materializa el estado `LEADERBOARD_ABIERTO`. Es el único estado en el que el sistema **empuja** datos hacia el usuario sin que medie una acción explícita: la conexión WebSocket única (`AppDataContext`) mantiene la clasificación actualizándose mientras la página esté abierta.

<div align=center>

|Zona de la página|CdU soportado|Comportamiento|
|-|-|-|
|`PriceTicker` (franja superior)|CU-01 *(extensión visual)*|Resalta tokens fijos (`HYPE.p`, `BTC.p`, `ETH.p`, `SOL.p`) más el token seleccionado; precios en vivo desde el canal `allMids`|
|`LeaderboardFilters` (selector de mercado, token, temporalidad, lado)|CU-01 (paso 2-3 del detalle)|Selección de la terna `(mercado, token, temporalidad)` + lado del ranking|
|`LightweightChart` (gráfico de precios)|CU-01 *(soporte visual)*|Velas servidas por el adaptador `MetaService.getCandles`; orientación contextual al ranking|
|`LeaderboardTable` (tabla de direcciones)|CU-01 (pasos 8-9 del detalle)|Snapshot inicial + actualizaciones incrementales; resuelve los nombres conocidos vía `POST /api/direcciones/resolver`|
|`CoverageBar`|—|Indicador del progreso de la ventana en vivo desde que se eligió la terna actual|

</div>

### Transiciones que arrancan en el leaderboard

<div align=center>

|Origen visual|Acción|Destino|CdU|
|-|-|-|-|
|`LeaderboardFilters` — mercado|Click en pestaña *Spot / Perp / Perp HIP-3*|`/leaderboard` *(mismo estado con nueva terna)*|CU-01 (flujo alt. 3a)|
|`LeaderboardFilters` — token|Selección en el combo|`/leaderboard` *(reinicio de la agregación)*|CU-01 (flujo alt. 3a)|
|`LeaderboardFilters` — temporalidad|Selección 1h…1w|`/leaderboard` *(reinicio de la agregación)*|CU-01 (flujo alt. 3a)|
|`LeaderboardFilters` — ranking|Toggle *Compradores / Vendedores*|`/leaderboard` *(re-ordena la tabla)*|CU-01|
|`LeaderboardTable` — dirección|Click en la dirección abreviada|`/direcciones/:addr`|CU-07 *(detalle global)*|
|Cabecera|*Entidades* / *Alertas*|Cambio de rama|—|

</div>

### Captura

<div align=center>

![Leaderboard — vista principal](../../imagenes/capitulosFinales/leaderboard.png)

</div>

---

## Rama 2 — Entidades (`/entidades` y descendientes)

Materializa el sub-árbol `ENTIDADES_ABIERTAS → ENTIDAD_ABIERTA → DIRECCIONES_ABIERTAS`. La estructura sigue el patrón **lista → detalle → sub-detalle** que el diagrama de contexto deja explícito.

### Subrama 2a — Relación de entidades

`EntidadesPage` (`/entidades`) presenta la relación de entidades registradas con filtro por nombre y, sobre cada fila, las operaciones puntuales del CRUD.

<div align=center>

|Elemento de interfaz|CdU|Resultado|
|-|-|-|
|Botón *Nueva entidad*|CU-02|Abre `EntidadForm` (modal); al confirmar, `POST /api/entidades` y refresco de la relación|
|Caja *Filtrar por nombre*|CU-03|Re-consulta con `q=…`|
|Enlace sobre el nombre|CU-04 *(punto de entrada)*|Navega a `/entidades/:id`|
|Botón *Eliminar* (papelera)|CU-05|Confirmación + `DELETE /api/entidades/:id`|

</div>

### Subrama 2b — Detalle de entidad y direcciones

`EntidadDetailPage` (`/entidades/:id`) muestra la entidad seleccionada y la relación de sus direcciones. **Materializa simultáneamente** los estados `ENTIDAD_ABIERTA` (edición de la entidad) y `DIRECCIONES_ABIERTAS` (operaciones sobre sus direcciones), consistente con el diagrama de contexto del capítulo 2 donde el segundo es un sub-contexto del primero.

<div align=center>

|Elemento de interfaz|CdU|Resultado|
|-|-|-|
|Botón *Volver a Entidades*|—|Navega a `/entidades`|
|Botón *Editar* (sección entidad)|CU-04|Abre `EntidadForm` precargado; al confirmar, `PATCH /api/entidades/:id`|
|Botón *Añadir dirección*|CU-06|Abre `DireccionForm`; al confirmar, `POST /api/entidades/:id/direcciones`|
|Enlace sobre la dirección abreviada|*Extensión CU-07*|Navega a `/direcciones/:addr` (detalle global)|
|Enlace *Hypurrscan*|—|Salida externa al explorador de Hyperliquid|
|Botón *Eliminar* (papelera de una dirección)|CU-08|Confirmación + `DELETE /api/entidades/:id/direcciones/:dirId`|

</div>

> El CdU **CU-07** (Abrir direcciones) se cumple sin pantalla independiente: las direcciones de la entidad se presentan en línea sobre la propia página de detalle de la entidad. La **extensión** del CdU para el detalle global de una dirección (saldos perp/spot, staking y operaciones recientes) sí justifica su propia ruta `/direcciones/:addr`, documentada en [ajustes de pila](ajustesDePila.md) y materializada por `DireccionDetailPage`.

### Subrama 2c — Detalle global de una dirección (extensión de CU-07)

`DireccionDetailPage` (`/direcciones/:addr`) es accesible desde **dos** orígenes:

<div align=center>

|Origen|Cómo se accede|
|-|-|
|Leaderboard|Click en la dirección abreviada de una fila|
|Entidad|Click en la dirección abreviada de una entidad|

</div>

La página agrupa cuatro vistas reconciliadas en pestañas, alimentadas por endpoints del adaptador hexagonal:

<div align=center>

|Pestaña|Endpoint|Fuente|
|-|-|-|
|*Perpetuos*|`GET /api/direcciones/:addr/perps`|`IHyperliquidSource.getPerpState`|
|*Spot*|`GET /api/direcciones/:addr/spot`|`IHyperliquidSource.getSpotState`|
|*Staking*|`GET /api/direcciones/:addr/staking`|`IHyperliquidSource.getDelegations`|
|*Operaciones*|`GET /api/direcciones/:addr/fills`|`IHyperliquidSource.getUserFills`|

</div>

> Esta vista materializa, además, **el cliente real** del sistema (Infinite Fieldx) tal como lo planteó el escenario: a partir del leaderboard, un operador puede entrar en cualquier dirección y disponer en una sola pantalla del contexto patrimonial completo, sin abandonar la herramienta.

### Captura

<div align=center>

![Entidades — relación y detalle](../../imagenes/capitulosFinales/entidades.png)
![Detalle global de una dirección](../../imagenes/capitulosFinales/direccion.png)

</div>

---

## Rama 3 — Alertas (`/alertas` y diálogos modales)

`AlertasPage` (`/alertas`) materializa el estado `ALERTAS_ABIERTAS`. El estado `ALERTA_ABIERTA` (edición de una alerta) se realiza con un **diálogo modal** (`AlertaForm`) sobre la misma página: no requiere ruta propia porque su contexto natural es la relación que se está editando.

<div align=center>

|Elemento de interfaz|CdU|Resultado|
|-|-|-|
|Selector *Estado* (`TODAS`, `OPERATIVA`, `DISPARADA`, `NOTIFICACION_FALLIDA`)|CU-10|Filtra la relación|
|Botón *Nueva alerta*|CU-09|Abre `AlertaForm` vacío; al confirmar, `POST /api/alertas`|
|Botón *Editar* (lápiz)|CU-11|Abre `AlertaForm` precargado; al confirmar, `PATCH /api/alertas/:id`|
|Botón *Eliminar* (papelera)|CU-12|Confirmación + `DELETE /api/alertas/:id`|

</div>

La página se refresca cada 6 segundos para reflejar los cambios de estado disparados por la **evaluación automática** (`CU-13`) y por la **emisión de notificación** (`CU-14`). El propio usuario no transita explícitamente a esos estados: son consecuencia del flujo continuo desde la L1 sobre las alertas activas. La columna *Estado* hace visible esa transición.

### Captura

<div align=center>

![Alertas — relación y formulario](../../imagenes/capitulosFinales/alertas.png)

</div>

---

## Trazabilidad: estado del capítulo 2 ↔ ruta del SPA

<div align=center>

|Estado (cap. 2)|Ruta|Componente raíz|CdU que originan transiciones desde aquí|
|-|-|-|-|
|`SISTEMA_DISPONIBLE`|`/` → `/leaderboard`|`LeaderboardPage` *(landing por defecto)*|CU-01, CU-03, CU-10 *(vía cabecera)*|
|`LEADERBOARD_ABIERTO`|`/leaderboard`|`LeaderboardPage`|CU-01 *(reselección)*; salida a `DireccionDetailPage`|
|`ENTIDADES_ABIERTAS`|`/entidades`|`EntidadesPage`|CU-02, CU-04, CU-05|
|`ENTIDAD_ABIERTA`|`/entidades/:id`|`EntidadDetailPage`|CU-04 *(in-place)*, CU-07|
|`DIRECCIONES_ABIERTAS`|`/entidades/:id` *(misma página)*|`EntidadDetailPage`|CU-06, CU-08; salida a `DireccionDetailPage` *(extensión)*|
|`ALERTAS_ABIERTAS`|`/alertas`|`AlertasPage`|CU-09, CU-11, CU-12|
|`ALERTA_ABIERTA`|`/alertas` *(modal `AlertaForm`)*|`AlertaForm`|CU-09 *(crear)*, CU-11 *(editar)*|

</div>

Todos los estados del diagrama de contexto del capítulo 2 tienen su ruta. Toda transición tiene su elemento de interfaz. No hay estados ni transiciones huérfanas.

---

## Decisiones de presentación reseñables

<div align=center>

|Decisión|Motivación|
|-|-|
|`SISTEMA_DISPONIBLE` aterriza en el leaderboard|Es el área que satisface la propuesta de valor central del cliente (monitorización en tiempo real); el resto es soporte para esa monitorización|
|`ENTIDAD_ABIERTA` y `DIRECCIONES_ABIERTAS` en la misma ruta|El sub-contexto está siempre presente cuando hay entidad abierta; separar rutas obligaría a navegación redundante|
|`ALERTA_ABIERTA` como modal, no como ruta|El edit-in-place mantiene la relación visible debajo, soportando comparación entre alertas existentes y la que se edita|
|`/direcciones/:addr` accesible desde dos orígenes|El detalle global de una dirección es **transversal** a entidades y leaderboard: el actor accede a ella desde el contexto donde la haya encontrado|
|Página única para el leaderboard|El WS es único por sesión (RS-01); cualquier reapertura reutiliza la conexión gestionada por `AppDataContext`|

</div>
