# Prototipos de interfaz

Los prototipos muestran la disposición visual de cada una de las tres pestañas de la aplicación. Se han creado como wireframes Salt (PlantUML) para mantener la coherencia con el resto de diagramas del capítulo.

---

## Pestaña 1 — Leaderboard

La página principal contiene tres cuadros separados visualmente, uno por cada tipo de mercado: **Spot** (HIP-1/HIP-2), **Perps nativos** y **Perps HIP-3**. Cada cuadro incluye un selector de token de su categoría, un selector de temporalidad y una tabla con el ranking de compradores y vendedores.

<div align=center>

![Prototipo Leaderboard](../../imagenes/capitulo2/prototipo-leaderboard.svg)

*Figura 9 — Prototipo de la pestaña Leaderboard*

</div>

Cuando una dirección del ranking pertenece a una entidad registrada, el nombre de la entidad aparece en lugar de la dirección cruda (por ejemplo, *Wintermute* en la tabla Spot).

---

## Pestaña 2 — Entidades

La pestaña de entidades permite al usuario agrupar varias direcciones bajo un nombre. En la parte superior se muestra la lista de entidades existentes con sus direcciones y botones de edición. En la parte inferior, un formulario para crear una nueva entidad.

<div align=center>

![Prototipo Entidades](../../imagenes/capitulo2/prototipo-entidades.svg)

*Figura 10 — Prototipo de la pestaña Entidades*

</div>

---

## Pestaña 3 — Alertas

La pestaña de alertas muestra las alertas configuradas con su estado actual y permite crear nuevas alertas. El formulario de creación incluye selectores de mercado y token, campo para el umbral en dólares y campo para la URL del webhook.

<div align=center>

![Prototipo Alertas](../../imagenes/capitulo2/prototipo-alertas.svg)

*Figura 11 — Prototipo de la pestaña Alertas*

</div>
