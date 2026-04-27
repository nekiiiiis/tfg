# Modelo de datos

## Propósito

El modelo de datos materializa el [Modelo del dominio](../capitulo2/modeloDelDominio.md) en **almacenes concretos**: PostgreSQL para las entidades persistentes con reglas transaccionales (entidades, direcciones, alertas, notificaciones), Redis para los datos de alto ritmo y vida corta (snapshot del leaderboard, cola de reintentos). Cada decisión de modelado se justifica desde los CdU que lo motivan y los requisitos suplementarios que lo restringen.

<div align=center>

||||
|-|-|
|**Punto de partida**|Modelo del dominio del Capítulo 2; clases de entidad de dominio del [Diseño de clases](disenoClases.md); decisiones de almacenamiento del [Diseño de la arquitectura](disenoArquitectura.md)|
|**Resultado**|DER PostgreSQL con tipos, índices y constraints; esquema de claves Redis; políticas de retención y cifrado|
|**Restricción**|Cada tabla persistente debe ser recuperable tras reinicio del proceso (RS-03); las URLs de webhook se almacenan cifradas (RS-10); las consultas críticas deben servirse en tiempo (RS-01, RS-02)|

</div>

## PostgreSQL — Modelo entidad-relación

### Esquema completo

<div align=center>

![Diagrama Entidad-Relación PostgreSQL](../../imagenes/capitulo3/diseno-DER.svg)

</div>

### Tablas

#### `entidades`

Materializa la entidad del dominio `Entidad` y soporta CU-02..CU-05.

```sql
CREATE TABLE entidades (
  id           UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       VARCHAR(64)  NOT NULL,
  creada_en    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizada  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT entidades_nombre_unico UNIQUE (nombre),
  CONSTRAINT entidades_nombre_no_vacio CHECK (length(trim(nombre)) > 0)
);
```

<div align=center>

|Decisión|Justificación|
|-|-|
|`id` UUID v4 *(`gen_random_uuid()`)*|No expone orden de creación al cliente; permite generación segura desde el cliente sin bloqueo de secuencia|
|`UNIQUE (nombre)`|CU-02 / CU-04 prohíben duplicados — la unicidad se delega a la BD para evitar TOCTOU|
|`actualizada` con trigger `BEFORE UPDATE`|Trazabilidad mínima sin acoplar el código aplicativo|

</div>

#### `direcciones`

Materializa `Direccion` con la asociación a `Entidad`. Soporta CU-06..CU-08.

```sql
CREATE TABLE direcciones (
  id           UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  valor        CHAR(42)      NOT NULL,                       -- "0x" + 40 hex
  entidad_id   UUID          NOT NULL REFERENCES entidades(id) ON DELETE CASCADE,
  añadida_en   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT direcciones_valor_unico UNIQUE (valor),
  CONSTRAINT direcciones_formato CHECK (valor ~ '^0x[a-f0-9]{40}$')
);
CREATE INDEX direcciones_entidad ON direcciones (entidad_id);
```

<div align=center>

|Decisión|Justificación|
|-|-|
|`UNIQUE (valor)`|Una dirección pertenece a *como máximo* una entidad — invariante del modelo del dominio|
|`ON DELETE CASCADE`|Eliminar una entidad arrastra sus direcciones — CU-05 exige semántica de borrado en cascada|
|`CHECK` formato hex|Validación en el último anillo: aunque la app valide, un INSERT defectuoso no entra a la BD|
|Índice por `entidad_id`|CU-07 (listar direcciones de una entidad) ejecuta `WHERE entidad_id = ?`|

</div>

#### `alertas`

Materializa `AlertaPrecio` con el estado del ciclo de vida. Soporta CU-09..CU-13.

```sql
CREATE TYPE estado_alerta AS ENUM ('OPERATIVA','DISPARADA','NOTIFICACION_FALLIDA');
CREATE TYPE cruce         AS ENUM ('SUBE','BAJA');

CREATE TABLE alertas (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  token_simbolo   VARCHAR(16)     NOT NULL,
  mercado         VARCHAR(16)     NOT NULL CHECK (mercado IN ('Spot','PerpNativo','PerpHIP3')),
  umbral_valor    NUMERIC(28,8)   NOT NULL CHECK (umbral_valor > 0),
  umbral_cruce    cruce           NOT NULL,
  webhook_url_enc BYTEA           NOT NULL,                       -- cifrado pgp_sym_encrypt
  estado          estado_alerta   NOT NULL DEFAULT 'OPERATIVA',
  creada_en       TIMESTAMPTZ     NOT NULL DEFAULT now(),
  ultima_disparo  TIMESTAMPTZ     NULL,
  ultimo_intento  TIMESTAMPTZ     NULL
);
CREATE INDEX alertas_token_estado ON alertas (token_simbolo, estado);
CREATE INDEX alertas_estado       ON alertas (estado) WHERE estado <> 'OPERATIVA';
```

<div align=center>

|Decisión|Justificación|
|-|-|
|`webhook_url_enc BYTEA`|RS-10 — la URL nunca se almacena en claro. Cifrado simétrico con clave maestra de proceso (`pgp_sym_encrypt(url, secret)`)|
|`NUMERIC(28,8)`|Precios y umbrales de criptomonedas requieren precisión exacta — `float` no es admisible|
|Índice `(token_simbolo, estado)`|RS-02 (≤ 2 s): CU-13 ejecuta `WHERE token_simbolo = ? AND estado = 'OPERATIVA'` por cada `PrecioActualizado`|
|Índice parcial sobre `estado <> 'OPERATIVA'`|Listado priorizado de alertas en estado anómalo (UI), evita escanear las operativas — son la mayoría|
|`mercado` como `VARCHAR + CHECK`, no `ENUM`|`Spot`, `PerpNativo`, `PerpHIP3` se modelan como ENUM en TypeScript pero como check en BD por simplicidad de migraciones|

</div>

#### `notificaciones`

Materializa `Notificacion`. Soporta CU-13/CU-14 y la trazabilidad RS-09.

```sql
CREATE TYPE estado_entrega AS ENUM ('PENDIENTE','ENTREGADA','FALLIDA');

CREATE TABLE notificaciones (
  id                 UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  alerta_id          UUID            NOT NULL REFERENCES alertas(id) ON DELETE CASCADE,
  precio_disparador  NUMERIC(28,8)   NOT NULL,
  instante_emision   TIMESTAMPTZ     NOT NULL DEFAULT now(),
  estado             estado_entrega  NOT NULL DEFAULT 'PENDIENTE',
  intento            SMALLINT        NOT NULL DEFAULT 1,
  ultimo_error       TEXT            NULL,
  entregada_en       TIMESTAMPTZ     NULL
);
CREATE INDEX notif_alerta            ON notificaciones (alerta_id, instante_emision DESC);
CREATE INDEX notif_pendientes        ON notificaciones (estado) WHERE estado = 'PENDIENTE';
```

<div align=center>

|Decisión|Justificación|
|-|-|
|Persistencia *antes* de transmitir|RS-09: si el proceso muere durante la transmisión, la notificación queda en BD con `PENDIENTE` y un job de recuperación al arrancar la procesa|
|`intento` y `ultimo_error`|RS-07 — diagnóstico de fallos repetidos|
|Índice descendente por `instante_emision`|UI futura para auditar los últimos disparos por alerta|
|Índice parcial `estado = 'PENDIENTE'`|Recuperación de estado tras reinicio: `SELECT WHERE estado = 'PENDIENTE'` cubre exactamente la cardinalidad de interés|

</div>

#### `eventos_auditoria` *(opcional, preparación para RS-04)*

```sql
CREATE TABLE eventos_auditoria (
  id          BIGSERIAL    PRIMARY KEY,
  nombre      VARCHAR(64)  NOT NULL,
  payload     JSONB        NOT NULL,
  ocurrido_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX eventos_auditoria_nombre ON eventos_auditoria (nombre, ocurrido_en DESC);
```

> No se utiliza en el alcance del TFG, pero su existencia anticipada deja preparada la herramienta de auditoría que RS-04 prevé. Cualquier evento del bus puede persistirse aquí sin tocar el código que lo emite.

### Diagrama relacional

<div align=center>

|Origen|Destino|Cardinalidad|Acción de borrado|
|-|-|-|-|
|`direcciones.entidad_id`|`entidades.id`|N:1|`CASCADE`|
|`notificaciones.alerta_id`|`alertas.id`|N:1|`CASCADE`|

</div>

> No hay FK desde `alertas` a `tokens`/`mercados` porque el catálogo de tokens vive en Hyperliquid: la integridad referencial se valida en el servicio de aplicación contra `CatalogoQueryService.existeToken(...)`, no en la BD.

### Cifrado de webhooks (RS-10)

<div align=center>

|Aspecto|Decisión|
|-|-|
|Algoritmo|Cifrado simétrico autenticado provisto por la extensión `pgcrypto` de PostgreSQL (`pgp_sym_encrypt` / `pgp_sym_decrypt`, AES-CFB 256)|
|Clave maestra|Externalizada al entorno del proceso (`APP_SECRET`); nunca se persiste con los datos|
|Ámbito de cifrado|Únicamente el campo `webhook_url_enc`. El resto de columnas no contiene información sensible|
|Punto de cifrado/descifrado|En el repositorio de la capa de infraestructura. La capa de aplicación maneja el `Webhook` ya descifrado durante el tiempo mínimo necesario; nunca se loguea ni se serializa de vuelta al cliente|
|Rotación|Tarea de operación, no automatizada en el alcance del TFG|

</div>

> Las invocaciones SQL concretas (`INSERT … pgp_sym_encrypt(...)` y `SELECT pgp_sym_decrypt(...)`) son detalles de implementación que el Capítulo 4 incorporará en el repositorio TypeORM correspondiente.

## Redis — Estructuras y claves

Redis sostiene dos estructuras: el **snapshot del leaderboard** (Sorted Set) y la **cola de reintentos** de notificaciones (List).

### Snapshot del leaderboard

<div align=center>

|Aspecto|Diseño|
|-|-|
|Estructura|*Sorted Set* (ZSET) por terna `(mercado, token, temporalidad)`. Cada elemento es una dirección; el *score* es el volumen acumulado dentro de la ventana|
|Patrón de clave|`lb:{mercado}:{token}:{temporalidad}` para el ZSET principal y `lb:{mercado}:{token}:{temporalidad}:tiempos` para el ZSET auxiliar de timestamps por operación|
|Lectura|*Top-N* del leaderboard servido por la operación nativa de rango invertido del ZSET en O(log N + M) — suficiente para RS-01|
|Escritura|Incremento atómico del *score* de la dirección al recibir cada `OperacionRecibida`; alta del timestamp en el ZSET auxiliar|
|Purga|Al insertar, las operaciones más antiguas que la ventana deslizante se eliminan del ZSET auxiliar; los volúmenes correspondientes se decrementan en el ZSET principal|

</div>

<div align=center>

|Decisión|Justificación|
|-|-|
|Sorted Set indexado por dirección con `score = volumen`|La consulta del *top-N* es logarítmica; RS-01 satisfecho con margen|
|Clave compuesta `{mercado}:{token}:{temporalidad}`|Permite mantener leaderboards independientes en paralelo sin colisiones|
|Sorted Set auxiliar `:tiempos`|La purga por ventana deslizante exige conocer el instante de cada operación; el ZSET principal solo lleva volumen|
|AOF (Append-Only File) habilitado|RS-03: el leaderboard sobrevive al reinicio del contenedor; el calentamiento tras *restart* se reduce al desfase de la AOF (segundos)|
|Sin TTL global|La purga manual por ventana es más precisa que un TTL; éste invalidaría datos antes de tiempo cuando la ventana es larga|

</div>

### Cola de reintentos de notificaciones (RS-07)

<div align=center>

|Aspecto|Diseño|
|-|-|
|Estructura|Lista (LIST) FIFO accedida con bloqueo en consumo (`LPUSH` por el productor, *blocking pop* por el *worker*)|
|Clave|`notif:retry`|
|Carga útil|Identificador de la notificación, número de intento y marca temporal del próximo intento|
|Backoff|Exponencial: 1 s, 5 s, 30 s, 5 min, 30 min, 1 h. El *worker* verifica el siguiente intento y reencola si aún no le toca|
|Persistencia|AOF habilitado: la cola sobrevive al reinicio del contenedor|
|Tope de intentos|6. Tras el sexto fallo, la alerta queda en `NOTIFICACION_FALLIDA` y exige intervención manual|

</div>

### Inventario de claves Redis

<div align=center>

|Patrón de clave|Tipo|Vida|Subsistema dueño|
|-|-|-|-|
|`lb:{mercado}:{token}:{temporalidad}`|ZSET|Persistente con AOF|S-LEAD|
|`lb:{mercado}:{token}:{temporalidad}:tiempos`|ZSET|Persistente con AOF|S-LEAD|
|`notif:retry`|LIST|Persistente con AOF|S-NOTI|

</div>

## Estrategia de versionado del esquema

El esquema se evoluciona mediante **migraciones reversibles** versionadas: cada cambio del modelo de datos (alta de tabla, índice, columna o tipo) se materializa en una migración atómica que se aplica de forma ordenada. El conjunto inicial de migraciones cubre, en este orden lógico, las extensiones del SGBD (`pgcrypto`), los tipos enumerados (`estado_alerta`, `cruce`, `estado_entrega`), las tablas del catálogo (`entidades`, `direcciones`), la tabla `alertas`, la tabla `notificaciones` y la tabla opcional `eventos_auditoria`.

> El sistema parte sin datos de semilla: se puebla por la actividad del Usuario (catálogo, alertas) y por el flujo entrante desde Hyperliquid. La generación, ubicación y código de cada migración son detalles de implementación que se entregan en el Capítulo 4.

## Políticas de retención

<div align=center>

|Tabla / clave|Política|Justificación|
|-|-|-|
|`entidades`, `direcciones`, `alertas`|Sin retención: se conservan hasta que el Usuario las elimine explícitamente (CU-05, CU-08, CU-12)|Datos de configuración del Usuario|
|`notificaciones`|Conservación indefinida en el alcance del TFG; en producción se purgan tras 90 días|RS-09 exige trazabilidad pero no perpetuidad. 90 días cubre auditorías razonables sin saturar la BD|
|`eventos_auditoria`|Sin uso en el alcance; cuando se active, retención 30 días|Sondas de evaluación de extensibilidad, no datos del usuario|
|`lb:*` (Redis)|Ventana deslizante por temporalidad: 5min, 1h, 24h. Operaciones más antiguas se purgan continuamente|Modelo "leaderboard en vivo": el dato fuera de ventana no aporta|
|`notif:retry` (Redis)|Hasta consumo o expiración tras 6 intentos|Política de reintentos|

</div>

## Validación del modelo de datos

<div align=center>

|Criterio|Comprobación|
|-|-|
|**Trazabilidad con el dominio**|Cada entidad persistente del dominio tiene su tabla. `LeaderboardEnVivo` se modela en Redis con justificación documentada|
|**Cumplimiento de RS**|RS-01 vía *Sorted Set* en Redis; RS-02 vía índice `(token_simbolo, estado)`; RS-09 vía persistencia de notificaciones; RS-10 vía cifrado simétrico del campo `webhook_url_enc` con clave maestra externalizada|
|**Recuperación tras reinicio**|PostgreSQL durable por defecto; Redis con AOF — el leaderboard se calienta en segundos tras restart|
|**Atomicidad**|Operaciones multi-tabla (creación de entidad con direcciones iniciales) en transacción ACID; operaciones Redis multi-clave en `MULTI/EXEC`|
|**Consultas críticas con índice**|`alertas (token_simbolo, estado)`, `direcciones (entidad_id)`, `notif (alerta_id)`, `notif_pendientes`|

</div>

## Trazabilidad

<div align=center>

|De|A|Mecanismo|
|-|-|-|
|[Modelo del dominio](../capitulo2/modeloDelDominio.md)|Tablas y estructuras Redis|Cada entidad persistente del dominio se materializa explícitamente|
|[Diseño de la arquitectura](disenoArquitectura.md)|Esta especificación|Decisión PostgreSQL+Redis se concreta en esquema y claves|
|[Diseño de clases](disenoClases.md)|Tablas|Cada `XxxOrmEntity` se mapea a su tabla; cada `XxxOrmMapper` traduce entre dominio y ORM|
|RS-01, RS-02, RS-07, RS-09, RS-10|Decisiones del modelo|Cada decisión sensible cita el RS|
|Capítulo 4|Migraciones e implementación de repositorios|Las migraciones del esquema y los repositorios ORM son la primera entrega del Capítulo 4|

</div>
