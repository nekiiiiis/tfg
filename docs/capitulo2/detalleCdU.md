# Detalle de casos de uso

## CU-01 — Consultar leaderboard

<div align=center>

|Paso|El actor hace|El sistema responde|
|-|-|-|
|1|Accede a la pestaña Leaderboard.||
|2||Muestra selectores de mercado, token y temporalidad.|
|3|Selecciona mercado, token y temporalidad.||
|4||Se suscribe al WebSocket de Hyperliquid.|
|5||Calcula volúmenes por dirección.|
|6||Resuelve nombres de entidades.|
|7||Muestra leaderboard ordenado.|
|8|Permanece en la vista.||
|9||Actualiza en tiempo real.|

</div>

<div align=center>

![Diagrama de secuencia CU-01](../../imagenes/capitulo2/CU01-secuencia.svg)

</div>

---

## CU-04 — Configurar alerta

<div align=center>

|Paso|El actor hace|El sistema responde|
|-|-|-|
|1|Accede a la pestaña Alertas.||
|2||Muestra alertas existentes y formulario.|
|3|Selecciona mercado y token.||
|4|Introduce umbral en $ y URL webhook.||
|5|Pulsa "Crear alerta".||
|6||Valida datos.|
|7||Crea y activa AlertaPrecio.|
|8||Muestra confirmación.|

</div>

<div align=center>

![Diagrama de actividad CU-04](../../imagenes/capitulo2/CU04-actividad.svg)

</div>

---

## CU-06 — Evaluar alertas

<div align=center>

|Paso|El actor hace|El sistema responde|
|-|-|-|
|1|Hyperliquid L1 envía precio actualizado.||
|2||Obtiene alertas activas para ese token.|
|3||Compara precio con umbral.|
|4||Marca como Disparada si se traspasa.|
|5||Ejecuta CU-07.|

</div>

<div align=center>

![Diagrama de actividad CU-06](../../imagenes/capitulo2/CU06-actividad.svg)

</div>

---

## CU-07 — Enviar notificación

<div align=center>

|Paso|El actor hace|El sistema responde|
|-|-|-|
|1||Genera notificación (token, precio, umbral).|
|2||Envía POST al webhook.|
|3|Webhook responde 200 OK.||
|4||Marca alerta como Notificada.|
|5||Rearma alerta a Activa.|

</div>

<div align=center>

![Diagrama de secuencia CU-07](../../imagenes/capitulo2/CU07-secuencia.svg)

</div>
