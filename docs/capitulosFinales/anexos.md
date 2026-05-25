# Anexos

Material de soporte que, por extensión o por falta de contexto en su capítulo natural, se recoge aquí. Los anexos están agrupados por afinidad y referenciados desde los capítulos pertinentes.

> Esta sección **complementa**, no sustituye, los artefactos detallados en los capítulos 2 y 3. Su contenido es deliberadamente tabular: son **catálogos y *checklists* de operación**, no flujos. Donde el material es un flujo o una relación, está en los capítulos correspondientes con su diagrama.

## A. Resumen del catálogo de casos de uso

Recopilación íntegra del catálogo introducido en [Actores y casos de uso](../capitulo2/actoresYCasosDeUso.md), con su trazabilidad a la implementación.

<div align=center>

|ID|Nombre|Actor primario|Tipo|Estado del CdC|Implementación back|Implementación front|
|-|-|-|-|-|-|-|
|CU-01|Consultar leaderboard|Usuario, Hyperliquid L1|Primario|`LEADERBOARD_ABIERTO`|`modules/leaderboard/*` + `sources/public-ws.adapter.ts`|`pages/LeaderboardPage.tsx` + `features/leaderboard/*`|
|CU-02|Crear entidad|Usuario|Primario|`ENTIDADES_ABIERTAS → ENTIDAD_ABIERTA`|`modules/catalogo/catalogo.service.ts`|`features/catalogo/EntidadForm.tsx`|
|CU-03|Abrir entidades|Usuario|Primario|`SISTEMA_DISPONIBLE → ENTIDADES_ABIERTAS`|`modules/catalogo/catalogo.service.ts`|`pages/EntidadesPage.tsx`|
|CU-04|Editar entidad|Usuario|Primario|`ENTIDADES_ABIERTAS → ENTIDAD_ABIERTA`|`modules/catalogo/catalogo.service.ts`|`features/catalogo/EntidadForm.tsx`|
|CU-05|Eliminar entidad|Usuario|Primario|`ENTIDADES_ABIERTAS` *(in situ)*|`modules/catalogo/catalogo.service.ts`|`pages/EntidadesPage.tsx`|
|CU-06|Añadir dirección|Usuario|Primario|`DIRECCIONES_ABIERTAS` *(in situ)*|`modules/catalogo/catalogo.service.ts`|`features/catalogo/DireccionForm.tsx`|
|CU-07|Abrir direcciones|Usuario|Primario|`ENTIDAD_ABIERTA → DIRECCIONES_ABIERTAS`|`modules/catalogo/catalogo.service.ts` + `modules/direccion-detalle/*`|`pages/EntidadDetailPage.tsx` + `pages/DireccionDetailPage.tsx`|
|CU-08|Eliminar dirección|Usuario|Primario|`DIRECCIONES_ABIERTAS` *(in situ)*|`modules/catalogo/catalogo.service.ts`|`pages/EntidadDetailPage.tsx`|
|CU-09|Crear alerta de precio|Usuario|Primario|`ALERTAS_ABIERTAS → ALERTA_ABIERTA`|`modules/alertas/alertas.service.ts`|`features/alertas/AlertaForm.tsx`|
|CU-10|Abrir alertas de precio|Usuario|Primario|`SISTEMA_DISPONIBLE → ALERTAS_ABIERTAS`|`modules/alertas/alertas.service.ts`|`pages/AlertasPage.tsx`|
|CU-11|Editar alerta de precio|Usuario|Primario|`ALERTAS_ABIERTAS → ALERTA_ABIERTA`|`modules/alertas/alertas.service.ts`|`features/alertas/AlertaForm.tsx`|
|CU-12|Eliminar alerta de precio|Usuario|Primario|`ALERTAS_ABIERTAS` *(in situ)*|`modules/alertas/alertas.service.ts`|`pages/AlertasPage.tsx`|
|CU-13|Evaluar alertas activas|Hyperliquid L1|Primario *(sistema)*|*(transición interna)*|`modules/evaluacion/*`|*(sin UI propia)*|
|CU-14|Enviar notificación|Servicio Webhook|Secundario *(`<<include>>` de CU-13)*|*(transición interna)*|`modules/notificacion/*`|*(sin UI propia)*|

</div>

> El [detalle completo de cada CdU](../capitulo2/detalleCdU.md) está en el capítulo 2. La cascada análisis-diseño-implementación está en el [capítulo 3](../capitulo3/disenoCdU.md) y en [Casos de uso implementados](casosDeUsoImplementados.md).

## B. Requisitos suplementarios y su verificación

Recopilación de RS-01..RS-10 con un *checklist* operativo de qué inspeccionar para verificar cada requisito sobre el sistema en marcha.

<div align=center>

|ID|Categoría|Descripción|Verificable por|
|-|-|-|-|
|**RS-01**|Rendimiento|Leaderboard ≤ 1 s|Inspección del WS del navegador en `/leaderboard`: la diferencia entre el `ts` de un trade y la llegada al cliente está habitualmente ≤ 1 s sobre red local|
|**RS-02**|Rendimiento|Evaluación ≤ 2 s|`LOG_LEVEL=debug` muestra en logs el delta entre la emisión de `PrecioActualizado` y la transición de la alerta a `DISPARADA`|
|**RS-03**|Disponibilidad|24/7|`docker compose ps` evidencia `restart: unless-stopped` y healthchecks activos; `GET /health` devuelve 200 + frescura del feed|
|**RS-04**|Extensibilidad|Nuevos consumidores sin tocar el resto|Inspeccionar `bus.ts`: añadir un `bus.on(...)` no requiere modificar productores ni otros consumidores|
|**RS-05**|Usabilidad|Áreas independientes|Tres rutas raíz en `web/src/App.tsx`; abrir una pestaña por área no interfiere con las otras|
|**RS-06**|Usabilidad|Mercados distinguidos|`LeaderboardFilters` separa `Perp / Spot / Perp HIP-3` como pestañas; las alertas y las direcciones se etiquetan con el mercado en BD y en UI|
|**RS-07**|Fiabilidad|Reintentos de notificación|`SELECT estado, intento, proximo_intento FROM notificaciones` muestra el avance del worker; la política de backoff se configura por `.env`|
|**RS-08**|Escalabilidad|Sustituibilidad de la fuente|`HYPERLIQUID_SOURCE=nanoreth` redirige el código a `NanorethRpcAdapter` sin tocar el núcleo|
|**RS-09**|Trazabilidad|Cada notificación queda registrada|`SELECT * FROM notificaciones WHERE alerta_id = ?` reconstruye el historial completo|
|**RS-10**|Seguridad|Webhooks cifrados|`SELECT webhook_url_enc FROM alertas` devuelve `bytea` opaco; solo `pgp_sym_decrypt(...)` con `APP_SECRET` recupera la URL|

</div>

## C. Variables de entorno de la aplicación

Tomado de [`src/.env.example`](../../src/.env.example), agrupado por área. Las variables operativas adicionales que solo afectan al *tuning* del leaderboard y del retry worker se encuentran documentadas en el propio `.env.example` con comentarios extensos.

### Servidor

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`NODE_ENV`|`development`|`development` / `production` / `test`|
|`HOST`|`0.0.0.0`|Interfaz de escucha del backend|
|`PORT`|`3001`|Puerto del backend (HTTP + WS)|
|`LOG_LEVEL`|`info`|Nivel de `pino` (`trace`, `debug`, `info`, `warn`, `error`)|
|`CORS_ORIGIN`|`http://localhost:5173`|Origen permitido en desarrollo (Vite). En producción, mismo origen|

</div>

### Hyperliquid (RS-08)

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`HYPERLIQUID_SOURCE`|`public-ws`|`public-ws` o `nanoreth`|
|`HYPERLIQUID_WS_URL`|`wss://api.hyperliquid.xyz/ws`|Endpoint WebSocket público|
|`HYPERLIQUID_INFO_URL`|`https://api.hyperliquid.xyz/info`|Endpoint REST público|
|`NANORETH_RPC_URL`|`http://localhost:8545`|Endpoint del nodo nanoreth (esqueleto)|
|`HYPERLIQUID_FEED_STALE_SECONDS`|`15`|Umbral de salud: sin mensajes durante este tiempo, el feed se reporta como *degraded*|

</div>

### PostgreSQL

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`POSTGRES_HOST`|`localhost`|Host de la BD|
|`POSTGRES_PORT`|`5432`|Puerto de la BD|
|`POSTGRES_DB`|`infinite_fieldx`|Nombre de la base|
|`POSTGRES_USER`|`fieldx`|Usuario|
|`POSTGRES_PASSWORD`|`fieldx_dev_password_change_me`|Contraseña *(obligatorio sobrescribir en producción)*|
|`DATABASE_URL`|construida en Compose|URL completa de conexión|

</div>

### Seguridad (RS-10)

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`APP_SECRET`|*(sin valor)*|Clave maestra para `pgp_sym_encrypt`/`pgp_sym_decrypt`. **Obligatoria.** Generar con `openssl rand -base64 32`|

</div>

### Leaderboard (RS-01, RS-03)

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`LEADERBOARD_WINDOW_1H`|`3600`|Ventanas en segundos por temporalidad (`1H`, `4H`, `6H`, `12H`, `1D`, `1W`)|
|`LEADERBOARD_MAX_OPS_PER_TERNA`|`200000`|Corte por seguridad: máximo de operaciones almacenadas en RAM por terna|
|`LEADERBOARD_PREWARM`|*(definido por entorno)*|CSV de pares `Mercado\|Token` que se abren al arrancar el servidor (mantiene los canales vivos sin clientes conectados)|

</div>

### Reintentos de notificación (RS-07)

<div align=center>

|Variable|Valor por defecto|Descripción|
|-|-|-|
|`NOTIFICATION_RETRY_BACKOFF_SECONDS`|`1,5,30,300,1800,3600`|Lista de delays acumulados (segundos)|
|`NOTIFICATION_RETRY_TICK_SECONDS`|`5`|Frecuencia con la que el worker comprueba pendientes|

</div>

## D. Esquema lógico de la base de datos

Recopilación sintética del [modelo de datos](../capitulo3/modeloDeDatos.md) en una sola tabla.

<div align=center>

|Tabla|Función|Soporta CdU|
|-|-|-|
|`entidades`|Catálogo de entidades del usuario|CU-02..CU-05|
|`direcciones`|Direcciones asociadas a entidades (cascade ON DELETE)|CU-06..CU-08|
|`alertas`|Alertas de precio con URL del webhook cifrada|CU-09..CU-13|
|`notificaciones`|Historial e intentos de entrega; cola virtual para reintentos|CU-14, RS-07, RS-09|
|`lb_trades`|Trades históricos para sembrar ventanas largas del leaderboard|CU-01 *(soporte operativo)*|

</div>

> El diagrama Entidad-Relación está en [`/imagenes/capitulo3/diseno-DER.svg`](../../imagenes/capitulo3/diseno-DER.svg).

## E. Smoke tests ejecutados

Pruebas de fumigado documentadas como evidencia de la disciplina de **Pruebas**. No constituyen una suite automatizada (eso queda como futura línea, ver [Recomendaciones](futuras.md#pruebas-automatizadas)).

<div align=center>

|Comprobación|Comando|Significado de éxito|
|-|-|-|
|Tipos del backend|`cd src/app && npm run type-check` (`tsc --noEmit`)|Sin errores → el dominio, los servicios y los adaptadores son coherentes en tipos|
|Build del frontend|`cd src/web && npm run build` (`vite build`)|Bundle compilado en `dist/`; sin errores TS|
|Migraciones aplican|`cd src/app && npm run db:migrate`|Postgres acepta el esquema completo; `pgcrypto` queda cargada|
|Arranque del backend en standalone|`cd src/app && npm run dev`|Conecta al WS público de Hyperliquid, precarga el catálogo y queda escuchando en `:3001`|
|Healthcheck del backend|`curl http://localhost:3001/health`|`200 OK` con `feedAge < HYPERLIQUID_FEED_STALE_SECONDS`|
|Build de imagen Docker|`docker build -f src/app/Dockerfile src/`|Imagen final < 250 MB; usuario `node` (no-root)|
|Despliegue completo|`docker compose -f src/docker-compose.yml up -d`|Dos contenedores `Up · healthy`; SPA accesible en `:3001/`|
|Recorrido funcional del SPA|Manual: las cinco páginas (`/leaderboard`, `/entidades`, `/entidades/:id`, `/direcciones/:addr`, `/alertas`) cargan sin errores y muestran datos|

</div>

> Las cifras concretas (tiempos, uso de RAM, número de trades por segundo durante la ejecución) varían según la actividad real de Hyperliquid en el momento del test. Lo que el smoke test garantiza es la **estructura operativa**: arranca, conecta, persiste y sirve.

## F. Pares precargados (`LEADERBOARD_PREWARM`)

Recomendación por defecto para una instalación de demostración:

```
LEADERBOARD_PREWARM=PerpNativo|BTC.p,PerpNativo|ETH.p,PerpNativo|HYPE.p,Spot|HYPE/USDC,Spot|UBTC/USDC,Spot|UETH/USDC
```

Estos pares cubren los activos con mayor volumen sostenido en Hyperliquid (BTC, ETH, HYPE en perp; las versiones spot correspondientes). El prewarm mantiene los canales abiertos 24/7, alimentando `lb_trades` para que las ventanas `1d` y `1w` lleguen llenas a cualquier sesión sin esperar a que un cliente conecte.

## G. Material gráfico generado durante el TFG

Resumen por capítulo:

<div align=center>

|Capítulo|Carpeta|Contenido|
|-|-|-|
|1|[`/imagenes/capitulo1/`](../../imagenes/capitulo1/)|Figura 1 (Fases de RUP) y diagramas auxiliares|
|2|[`/imagenes/capitulo2/`](../../imagenes/capitulo2/)|Modelo del dominio, diagrama de objetos, diagrama de estados, diagrama de CdU, diagrama de contexto, prototipos P1..P6, secuencias y actividades de CU-01..CU-14|
|3|[`/imagenes/capitulo3/`](../../imagenes/capitulo3/)|Vista de capas, vista de módulos, bus de eventos, secuencias de diseño (CU-01, CU-09, CU-13, CU-14, CRUD), modelo Entidad-Relación, diagrama de despliegue, paquetes de diseño|
|Caps. finales|[`/imagenes/capitulosFinales/`](../../imagenes/capitulosFinales/)|*Ver inventario detallado más abajo*|

</div>

Inventario detallado del material gráfico de los capítulos finales:

<div align=center>

|Diagrama / captura|Documento que lo referencia|
|-|-|
|`navegacion.svg`|[mapaNavegacion.md](mapaNavegacion.md)|
|`cascadaCdU.svg`|[casosDeUsoImplementados.md](casosDeUsoImplementados.md)|
|`cu-01-secuencia.svg`|[CU-01](casosDeUsoImplementados.md#cu-01--consultar-leaderboard)|
|`cu-09-secuencia.svg`|[CU-09](casosDeUsoImplementados.md#cu-09--crear-alerta-de-precio)|
|`cu-13-secuencia.svg`|[CU-13](casosDeUsoImplementados.md#cu-13--evaluar-alertas-activas)|
|`cu-14-secuencia.svg`|[CU-14](casosDeUsoImplementados.md#cu-14--enviar-notificación)|
|`patronCRUD.svg`|[Patrón CRUD](casosDeUsoImplementados.md#casos-de-uso-crud--cu-02cu-08-y-cu-10cu-12)|
|`ajustesPila.svg`|[ajustesDePila.md](ajustesDePila.md)|
|`arbolObjetivos.svg`|[conclusiones.md](conclusiones.md)|
|`coberturaRS.svg`|[Cobertura RS](conclusiones.md#cobertura-de-los-requisitos-suplementarios)|
|`decisionesTecnicas.svg`|[Decisiones técnicas](discusion.md#decisiones-técnicas-de-mayor-calado)|
|`compromisosTransversales.svg`|[Compromisos transversales](discusion.md#compromisos-transversales)|
|`futurasLineas.svg`|[Mapa de continuaciones](futuras.md#mapa-de-continuaciones)|
|`plazosFuturas.svg`|[Plazos y dependencias](futuras.md#plazos-y-dependencias)|
|`leaderboard.png` · `entidades.png` · `direccion.png` · `alertas.png`|[mapaNavegacion.md](mapaNavegacion.md)|
|`cu-01-leaderboard.png` · `cu-09-alerta-form.png` · `cu-13-estado-alerta.png` · `cu-14-rearme.png`|[casosDeUsoImplementados.md](casosDeUsoImplementados.md)|

</div>

Las fuentes PlantUML viven en [`/modelosUML/capitulosFinales/`](../../modelosUML/capitulosFinales/) y los SVG se regeneran con `plantuml -tsvg modelosUML/capitulosFinales/*.puml -o imagenes/capitulosFinales/` desde la raíz del repositorio.

## H. Referencias cruzadas del repositorio

Para localizar rápidamente cualquier artefacto desde la lectura del TFG:

<div align=center>

|Tema|Documento|Código fuente|
|-|-|-|
|Capítulo 1|[`/docs/capitulo1/`](../capitulo1/)|—|
|Capítulo 2|[`/docs/capitulo2/`](../capitulo2/)|—|
|Capítulo 3|[`/docs/capitulo3/`](../capitulo3/)|—|
|Capítulos finales|[`/docs/capitulosFinales/`](.)|`src/`|
|Backend|[Diseño de paquetes](../capitulo3/disenoPaquetes.md)|[`src/app/`](../../src/app/)|
|Frontend|[Diseño de paquetes](../capitulo3/disenoPaquetes.md)|[`src/web/`](../../src/web/)|
|Persistencia|[Modelo de datos](../capitulo3/modeloDeDatos.md)|[`src/app/src/persistence/`](../../src/app/src/persistence/)|
|Despliegue|[Diseño del despliegue](../capitulo3/despliegue.md)|[`src/docker-compose.yml`](../../src/docker-compose.yml) + [`src/app/Dockerfile`](../../src/app/Dockerfile)|

</div>

> El repositorio es la fuente de verdad. Cualquier discrepancia entre este documento y el repositorio debe interpretarse a favor del repositorio: este TFG **describe** la solución, **no la sustituye**.
