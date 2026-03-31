# Estructuración del modelo de casos de uso

Los siete casos de uso se organizan en tres paquetes que se corresponden con las tres pestañas de la aplicación. Además, se explicitan las relaciones de inclusión y extensión entre ellos.

<div align=center>

![Diagrama de estructuración de CdU](../../imagenes/capitulo2/estructuraCdU.svg)

*Figura 12 — Estructuración del modelo de casos de uso*

</div>

## Paquetes

- **Leaderboard** — contiene CU-01 (Consultar leaderboard).
- **Entidades** — contiene CU-02 (Crear entidad) y CU-03 (Gestionar entidades).
- **Alertas** — contiene CU-04 (Configurar alerta), CU-05 (Gestionar alertas), CU-06 (Evaluar alertas) y CU-07 (Enviar notificación).

## Relaciones

- **CU-01 «extend» CU-02**: cuando el usuario ha registrado entidades, el leaderboard extiende su comportamiento para resolver los nombres de las direcciones conocidas.
- **CU-06 «include» CU-07**: siempre que una alerta se dispara durante la evaluación, se incluye obligatoriamente el envío de la notificación al webhook.
