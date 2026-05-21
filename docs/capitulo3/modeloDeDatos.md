# Modelo de datos

Materializa, a nivel **lógico** y **físico**, las entidades del modelo del dominio que requieren persistencia transaccional, junto con la tabla auxiliar `lb_trades` introducida en el diseño para soportar el histórico de operaciones del leaderboard. Cada decisión se justifica con los requisitos suplementarios pertinentes (RS-XX).

## Decisiones globales

<div align=center>

|Decisión|Justificación|
|-|-|
|**RDBMS**: PostgreSQL 16|Garantías ACID, índices BTREE, `enum`, `pgcrypto`. RS-03, RS-09|
|**ORM**: Drizzle (SQL-first)|Esquemas en TypeScript con tipos derivados; migraciones generadas como SQL plano legible|
|**Identificadores**: `uuid v4`|Generados por `gen_random_uuid()` (extensión `pgcrypto` cargada en migración). Evita filtraciones de cardinalidad y no requiere coordinación de IDs|
|**Cifrado simétrico de webhooks**: `pgp_sym_encrypt` / `pgp_sym_decrypt`|RS-10. La clave maestra (`APP_SECRET`) vive en el proceso de la aplicación, nunca en BD|
|**Estados como `enum` de Postgres**|Tipado estricto; `CHECK` automático; integración natural con índices compuestos|
|**Marcas temporales**: `timestamptz` (UTC)|Unifica zona horaria; conversión a local solo en presentación|
|**Trazabilidad de notificaciones**: tabla independiente|RS-09. Cada disparo se persiste como fila aparte; la alerta no acumula histórico|
|**Cola de reintentos sin servicios adicionales**|RS-07. Columna `proximo_intento` + índice `(estado, proximo_intento)` materializan la cola como query sobre la misma tabla|
|**Histórico de trades (`lb_trades`)**|Permite snapshots iniciales con cobertura real para temporalidades largas (`1d`, `1w`) y resiste reinicios del proceso sin perder cobertura. Tabla **técnica derivada** — no proviene del modelo del dominio, se introduce en esta actividad de diseño|

</div>

## Diagrama Entidad-Relación

<div align=center>

![Diagrama Entidad-Relación](../../imagenes/capitulo3/diseno-DER.svg)

</div>

## Tablas

### `entidades`

Soporta los casos de uso CU-02..CU-05.

<div align=center>

|Columna|Tipo|Constraint|Origen|
|-|-|-|-|
|`id`|`uuid`|PK, default `gen_random_uuid()`|—|
|`nombre`|`varchar(64)`|NOT NULL, UNIQUE *(`entidades_nombre_unico`)*, CHECK `length(trim(nombre)) > 0`|Atributo `nombre` de `Entidad` (MdD)|
|`creada_en`|`timestamptz`|NOT NULL, default `now()`|—|
|`actualizada`|`timestamptz`|NOT NULL, default `now()`|—|

</div>

Sin índices secundarios: los accesos típicos son por `id` (PK) o por `nombre` (cubierto por el `UNIQUE`).

### `direcciones`

Soporta los casos de uso CU-06..CU-08.

<div align=center>

|Columna|Tipo|Constraint|Origen|
|-|-|-|-|
|`id`|`uuid`|PK, default `gen_random_uuid()`|—|
|`valor`|`char(42)`|NOT NULL, UNIQUE *(`direcciones_valor_unico`)*, CHECK `valor ~ '^0x[a-f0-9]{40}$'`|Atributo `valor` de `Direccion` (MdD)|
|`entidad_id`|`uuid`|NOT NULL, FK → `entidades(id)` ON DELETE CASCADE|Asociación `Entidad ←→ Direccion`|
|`aniadida_en`|`timestamptz`|NOT NULL, default `now()`|—|

</div>

<div align=center>

|Índice|Columnas|Uso|
|-|-|-|
|`direcciones_entidad`|`(entidad_id)`|CU-07: listar las direcciones de una entidad|

</div>

La cascada en la baja (`ON DELETE CASCADE`) implementa la regla de negocio "al eliminar una entidad, sus direcciones se desvinculan" — preservando RS-09 a nivel del catálogo (no se quedan filas huérfanas).

### `alertas`

Soporta los casos de uso CU-09..CU-13.

<div align=center>

|Columna|Tipo|Constraint|Origen|
|-|-|-|-|
|`id`|`uuid`|PK, default `gen_random_uuid()`|—|
|`token_simbolo`|`varchar(16)`|NOT NULL|Atributo `token` de `AlertaPrecio`|
|`mercado`|`varchar(16)`|NOT NULL|`Mercado` (`Spot` / `PerpNativo` / `PerpHIP3`)|
|`umbral_valor`|`numeric(28,8)`|NOT NULL|`Umbral.valor`|
|`umbral_cruce`|`enum('cruce')` `SUBE \| BAJA`|NOT NULL|`Umbral.cruce`|
|`webhook_url_enc`|`bytea`|NOT NULL|`Webhook.url` cifrado con `pgp_sym_encrypt` (RS-10)|
|`estado`|`enum('estado_alerta')` `OPERATIVA \| DISPARADA \| NOTIFICACION_FALLIDA`|NOT NULL, default `OPERATIVA`|Estado del ciclo de vida de `AlertaPrecio`|
|`creada_en`|`timestamptz`|NOT NULL, default `now()`|—|
|`ultimo_disparo`|`timestamptz`|NULL|Última vez que la alerta se disparó|
|`ultimo_intento`|`timestamptz`|NULL|Último intento de notificación|

</div>

<div align=center>

|Índice|Columnas|Uso|
|-|-|-|
|`alertas_token_estado`|`(token_simbolo, estado)`|CU-13: recuperar todas las `OPERATIVA` para un token cuando llega un `PrecioActualizado`. **Soporta RS-02 (≤ 2 s).**|

</div>

`umbral_valor` usa `numeric(28,8)`: 20 dígitos enteros y 8 decimales — suficiente para precios desde 0,00000001 hasta 10²⁰ USD sin pérdida de precisión.

### `notificaciones`

Soporta los casos de uso CU-13 *(disparo)* y CU-14 *(entrega + reintentos)*. Es la tabla de **trazabilidad** del sistema (RS-09).

<div align=center>

|Columna|Tipo|Constraint|Origen|
|-|-|-|-|
|`id`|`uuid`|PK, default `gen_random_uuid()`|—|
|`alerta_id`|`uuid`|NOT NULL, FK → `alertas(id)` ON DELETE CASCADE|Asociación `AlertaPrecio ←→ Notificacion`|
|`precio_disparador`|`numeric(28,8)`|NOT NULL|`Precio.valor` en el instante del disparo|
|`instante_emision`|`timestamptz`|NOT NULL, default `now()`|Cuándo se decide disparar la notificación|
|`estado`|`enum('estado_entrega')` `PENDIENTE \| ENTREGADA \| FALLIDA`|NOT NULL, default `PENDIENTE`|Estado del ciclo de entrega|
|`intento`|`integer`|NOT NULL, default `1`|Contador acumulado; permite acotar reintentos|
|`proximo_intento`|`timestamptz`|NOT NULL, default `now()`|Cola virtual: el worker selecciona `proximo_intento <= now()`|
|`ultimo_error`|`text`|NULL|Mensaje de error del último intento fallido|
|`entregada_en`|`timestamptz`|NULL|Sello de éxito de entrega|

</div>

<div align=center>

|Índice|Columnas|Uso|
|-|-|-|
|`notif_alerta`|`(alerta_id, instante_emision)`|Consulta histórica por alerta: "ver entregas de esta alerta"|
|`notif_pendientes_proximas`|`(estado, proximo_intento)`|Worker de reintentos: tomar lo siguiente vencido. **Soporta RS-07.**|

</div>

La FK con cascada elimina las notificaciones cuando la alerta se borra; las notificaciones se mantienen mientras la alerta exista, incluyendo después del cambio de estado, por trazabilidad.

### `lb_trades`

Tabla **técnica** introducida en el diseño. Materializa el histórico continuo del flujo de operaciones de Hyperliquid para que el leaderboard cubra ventanas largas y sobreviva a reinicios.

<div align=center>

|Columna|Tipo|Constraint|Origen|
|-|-|-|-|
|`tid`|`text`|PK|Identificador del trade en Hyperliquid; dedupe natural entre WS y REST|
|`mercado`|`varchar(16)`|NOT NULL|`Operacion.mercado`|
|`token`|`varchar(64)`|NOT NULL|`Operacion.token` (forma display)|
|`direccion`|`char(42)`|NOT NULL|`Operacion.direccion`|
|`lado`|`varchar(4)`|NOT NULL|`Operacion.lado` (`BUY` / `SELL`)|
|`volumen_usd`|`double precision`|NOT NULL|`Operacion.volumenUsd`|
|`ts`|`double precision`|NOT NULL|Epoch milliseconds del trade|

</div>

<div align=center>

|Índice|Columnas|Uso|
|-|-|-|
|`lb_trades_ventana`|`(mercado, token, ts)`|`SELECT ... WHERE mercado=? AND token=? AND ts >= ? AND ts < ?` para el snapshot inicial|
|`lb_trades_ts`|`(ts)`|Job de limpieza periódico (retención ~8 días)|

</div>

#### Por qué no transaccional estricta

- El `INSERT` usa `ON CONFLICT (tid) DO NOTHING`: si el mismo trade llega por WS y por REST, no se duplica.
- No hay FK desde `lb_trades` hacia el catálogo (`direcciones`) porque la mayoría de direcciones del flujo de Hyperliquid no están en el catálogo del Usuario; obligar a FK forzaría a poblar el catálogo con direcciones desconocidas.
- La precisión `double precision` para `volumen_usd` y `ts` es adecuada para magnitudes financieras de mercado (volumen ≤ 10⁹, precisión ≥ 10⁻⁶) y minimiza el coste de almacenamiento.

#### Retención

El proceso periódico `TradePersistence.cleanup()` borra filas con `ts < now() - 8 días`. Ocho días = la ventana más larga (`1w`) más un margen.

## Extensiones de Postgres requeridas

<div align=center>

|Extensión|Uso|Cargada por|
|-|-|-|
|`pgcrypto`|`gen_random_uuid()` para los PK; `pgp_sym_encrypt`/`pgp_sym_decrypt` para webhooks|`CREATE EXTENSION IF NOT EXISTS pgcrypto` en `migrate.ts`|

</div>

## Cifrado del webhook (detalle de aplicación)

El módulo `persistence/crypto.ts` define dos helpers que se inyectan como fragmento SQL en las consultas Drizzle:

- **Escritura**: `pgp_sym_encrypt(${url}::text, ${APP_SECRET}::text)` produce el `bytea` que se guarda en `webhook_url_enc`.
- **Lectura**: `pgp_sym_decrypt(webhook_url_enc::bytea, ${APP_SECRET}::text) AS url_clara` descifra en el motor justo antes de devolver al cliente autorizado.

La operación de descifrado nunca aparece en logs (`pino` no serializa el campo) y se invoca únicamente desde `AlertasService.listar` y `NotificacionService.transmitirYActualizar`. Esto preserva **RS-10** sin replicar el secreto en código de aplicación.

## Migraciones

El esquema se aplica mediante Drizzle Kit en dos pasos:

<div align=center>

|Paso|Archivo|Contenido|
|-|-|-|
|Inicial|`0000_init.sql`|Enums (`cruce`, `estado_alerta`, `estado_entrega`), tablas `entidades`, `direcciones`, `alertas`, `notificaciones`, FKs e índices|
|Incremental|`0001_lb_trades.sql`|Tabla `lb_trades` con índices, idempotente con `CREATE IF NOT EXISTS`|

</div>

`migrate.ts` carga primero `pgcrypto` y a continuación ejecuta las migraciones. Adicionalmente, `ensure-schema.ts` se invoca al arrancar el servidor y garantiza la presencia de `lb_trades` de forma idempotente, incluso cuando el contenedor se levanta sobre un volumen ya existente sin migrar.

## Mapa tabla ↔ caso de uso

<div align=center>

|Tabla|CdU que la usan|Tipo de uso|
|-|-|-|
|`entidades`|CU-02 *(insert)*, CU-03 *(select)*, CU-04 *(update)*, CU-05 *(delete + cascade)*, CU-01 *(join indirecto vía `resolverDirecciones`)*|R/W|
|`direcciones`|CU-06 *(insert)*, CU-07 *(select)*, CU-08 *(delete)*, CU-01 *(select para `resolverDirecciones`)*|R/W|
|`alertas`|CU-09 *(insert)*, CU-10 *(select)*, CU-11 *(update)*, CU-12 *(delete + cascade)*, CU-13 *(select + update)*|R/W|
|`notificaciones`|CU-13 *(insert)*, CU-14 *(update)*, retry worker *(select pendientes + update)*|R/W|
|`lb_trades`|CU-01 *(insert continuo desde `LeaderboardService` y select para snapshot inicial)*|R/W|

</div>

## Trazabilidad de los requisitos

<div align=center>

|Requisito|Soporte en el modelo de datos|
|-|-|
|**RS-02** ≤ 2 s en evaluación|Índice `alertas_token_estado` permite leer las alertas relevantes en `O(log n)`|
|**RS-03** 24/7|Postgres durable; los reinicios del proceso no pierden estado de negocio; `lb_trades` soporta resincronizar `LeaderboardState` tras reinicio|
|**RS-06** Mercados distinguidos|`mercado` como columna explícita en `alertas` y `lb_trades`; forma parte del índice de ventana|
|**RS-07** Reintentos|Columna `proximo_intento` + índice `notif_pendientes_proximas`|
|**RS-09** Trazabilidad|Tabla `notificaciones` con `alerta_id`, `precio_disparador`, `instante_emision`, `entregada_en`, `intento`, `ultimo_error`|
|**RS-10** Seguridad del webhook|`webhook_url_enc bytea` cifrado con `pgcrypto`; clave maestra fuera de BD|

</div>
