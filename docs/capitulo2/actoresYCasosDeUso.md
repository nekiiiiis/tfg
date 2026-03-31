# Actores y casos de uso

## Actores

Se han identificado tres actores que interactúan con el sistema:

<div align=center>

|Actor|Tipo|Descripción|
|-|-|-|
|**Usuario**|Primario|Operador de Infinite Fieldx que utiliza las tres pestañas de la aplicación: consulta el leaderboard, gestiona entidades y configura alertas de precio.|
|**Hyperliquid L1**|Externo|Blockchain de Hyperliquid que proporciona precios y operaciones en tiempo real a través de su API REST y WebSocket.|
|**Servicio Webhook**|Externo|Sistema externo (Discord, Slack, etc.) que recibe las notificaciones HTTP enviadas cuando una alerta se dispara.|

</div>

---

## Casos de uso

<div align=center>

![Diagrama de casos de uso](../../imagenes/capitulo2/casosDeUso.svg)

*Figura 4 — Diagrama de actores y casos de uso*

</div>

Se han identificado siete casos de uso, organizados según la pestaña de la aplicación a la que pertenecen:

### Pestaña Leaderboard

<div align=center>

|CdU|Nombre|Actores|Descripción|
|-|-|-|-|
|CU-01|Consultar leaderboard|Usuario, Hyperliquid L1|El usuario selecciona un tipo de mercado (Spot, PerpNativo o PerpHIP3), un token y una temporalidad. El sistema muestra el ranking de compradores y vendedores actualizado en tiempo real. Las direcciones que pertenecen a entidades registradas aparecen con su nombre.|

</div>

### Pestaña Entidades

<div align=center>

|CdU|Nombre|Actores|Descripción|
|-|-|-|-|
|CU-02|Crear entidad|Usuario|El usuario crea una nueva entidad asignándole un nombre y una o más direcciones de Hyperliquid.|
|CU-03|Gestionar entidades|Usuario|El usuario edita el nombre de una entidad, añade o elimina direcciones de una entidad existente, o elimina la entidad por completo.|

</div>

### Pestaña Alertas

<div align=center>

|CdU|Nombre|Actores|Descripción|
|-|-|-|-|
|CU-04|Configurar alerta|Usuario|El usuario crea una alerta seleccionando un tipo de mercado, un token, un umbral en dólares y una URL de webhook.|
|CU-05|Gestionar alertas|Usuario|El usuario activa, desactiva o elimina alertas existentes.|
|CU-06|Evaluar alertas|Hyperliquid L1|El sistema evalúa de forma continua si el precio actual de un token ha traspasado el umbral de alguna alerta activa.|
|CU-07|Enviar notificación|Servicio Webhook|Cuando una alerta se dispara, el sistema envía una notificación HTTP al webhook configurado.|

</div>
