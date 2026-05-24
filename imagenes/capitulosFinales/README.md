# Capturas del SPA — capítulos finales

Esta carpeta agrupa las capturas de la interfaz de usuario referenciadas desde los capítulos finales del TFG.

## Inventario esperado

<div align=center>

|Archivo|Pantalla|Documento que la referencia|
|-|-|-|
|`leaderboard.png`|Vista principal del leaderboard (`/leaderboard`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`entidades.png`|Relación y detalle de entidades (`/entidades`, `/entidades/:id`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`direccion.png`|Detalle global de una dirección (`/direcciones/:addr`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`alertas.png`|Relación y formulario de alertas (`/alertas`)|[`mapaNavegacion.md`](../../docs/capitulosFinales/mapaNavegacion.md)|
|`cu-01-leaderboard.png`|CU-01 — Leaderboard en vivo|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-09-alerta-form.png`|CU-09 — Formulario de alerta|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-13-estado-alerta.png`|CU-13 — Transición de estado tras disparo|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|
|`cu-14-rearme.png`|CU-14 — Rearme tras entrega exitosa|[`casosDeUsoImplementados.md`](../../docs/capitulosFinales/casosDeUsoImplementados.md)|

</div>

## Cómo generar las capturas

1. Arrancar el sistema con `docker compose -f src/docker-compose.yml up -d --build`.
2. Abrir `http://localhost:3001/` en un navegador con resolución mínima 1440×900.
3. Esperar a que la cobertura del leaderboard sea visible en al menos un par (`HYPE.p` recomendado).
4. Capturar cada pantalla con la composición indicada en la tabla anterior y guardar el PNG en esta carpeta con el nombre exacto.

> Las capturas son **opcionales** para la lectura del TFG: el documento es coherente sin ellas y los enlaces a artefactos del repositorio se mantienen completos. Las capturas refuerzan la exposición en la defensa oral, donde la presentación se hará desde el repositorio y el sistema en ejecución (ver [El repositorio](../../../TFGs-gII/capítulos/elRepo.md) en los materiales de referencia).
