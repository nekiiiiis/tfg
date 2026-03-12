# Estado del arte

### Cielo Finance

**Cielo Finance** es una plataforma de análisis y alertas orientada al ecosistema DeFi. Permite configurar notificaciones sobre actividad on-chain: movimientos de wallets, transacciones de protocolos y condiciones de mercado en múltiples blockchains (Cielo Finance, s.f.).

<div align=center>

|Funcionalidad|Descripción|
|-|-|
|Alertas on-chain|Notificaciones sobre movimientos de wallets, transacciones, interacciones con contratos|
|Soporte multichain|Compatible con múltiples blockchains EVM y no-EVM|
|Filtros configurables|Condiciones personalizadas para activar alertas|

</div>

**Limitaciones para el escenario descrito:**

- **Velocidad insuficiente.** Cielo Finance no opera con la latencia necesaria para ser competitiva en el ecosistema de Hyperliquid, donde la velocidad de los datos es crítica para operadores de market making y HFT. El retardo en las alertas las hace inutilizables para la toma de decisiones en tiempo real.
- **Sin funcionalidades de análisis de actividad.** No ofrece leaderboards de compradores/vendedores ni clasificación de direcciones por volumen en un periodo determinado.
- **Sin seguimiento de precios en tiempo real.** No proporciona un dashboard de precios de los activos de Hyperliquid actualizado en tiempo real.

---

### Hypurrscan

**Hypurrscan** es el principal explorador de la blockchain de Hyperliquid. Permite consultar transacciones, posiciones abiertas, historial de trades y otros datos on-chain de cualquier dirección pública (Hypurrscan, s.f.).

<div align=center>

|Funcionalidad|Descripción|
|-|-|
|Explorador de blockchain|Consulta de transacciones, posiciones, historial de trades|
|Etiquetado de direcciones|Permite asignar nombres/etiquetas a direcciones conocidas para facilitar su identificación|
|Datos de mercado|Visualización de estadísticas generales de la plataforma|

</div>

**Limitaciones para el escenario descrito:**

- **Sin sistema de alertas.** Hypurrscan no ofrece ningún tipo de notificación ni alerta: ni de precio, ni de actividad de direcciones, ni de condiciones de mercado.
- **Sin leaderboard configurable.** No permite visualizar los mayores compradores o vendedores de un token en un periodo de tiempo seleccionado por el usuario.
- **Sin clustering de direcciones.** Aunque permite etiquetar direcciones individualmente, no ofrece la funcionalidad de agrupar direcciones en clusters con un nombre común para facilitar la identificación en análisis de actividad.
- **Sin precios en tiempo real integrados.** No proporciona un panel de seguimiento de precios de todos los activos de forma continua.

---

### TradingView

**TradingView** es una de las plataformas de análisis técnico más utilizadas a nivel mundial. Soporta datos de precio de Hyperliquid y permite configurar alertas sobre condiciones de precio y volumen (TradingView, s.f.).

<div align=center>

|Funcionalidad|Descripción|
|-|-|
|Gráficos y análisis técnico|Centenares de indicadores técnicos, timeframes configurables|
|Alertas de precio|Notificaciones cuando un activo alcanza un precio determinado|
|Soporte Hyperliquid|Datos de precio de los activos listados en Hyperliquid|

</div>

**Limitaciones para el escenario descrito:**

- **Sin análisis de actividad por dirección.** TradingView trabaja exclusivamente con datos de precio agregados (OHLCV), sin acceso a la actividad individual de direcciones.
- **Sin leaderboard ni etiquetado de direcciones.** No tiene concepto de análisis on-chain ni de tracking de wallets.
- **Alertas limitadas a condiciones de precio.** No permite alertas basadas en actividad de direcciones ni condiciones complejas del ecosistema.

---

### Herramientas de la comunidad de Hyperliquid

Existen bots y scripts desarrollados por la comunidad que acceden a los datos de Hyperliquid a través de su API pública. Estas soluciones cubren funcionalidades aisladas (consulta de posiciones, envío de órdenes, tracking de wallets específicas).

**Limitaciones:**

- Soluciones fragmentadas sin interfaz unificada.
- Sin mantenimiento profesional ni garantías de continuidad.
- No cubren las tres funcionalidades de forma integrada.
- Sin mecanismo de etiquetado/clustering de direcciones ni leaderboards.

---

### Análisis comparativo

<div align=center>

**Tabla 1.** Comparativa de soluciones existentes frente a las necesidades del cliente.

|Criterio|Cielo Finance|Hypurrscan|TradingView|Herramientas comunidad|**Solución propuesta**|
|-|-|-|-|-|-|
|Precios en tiempo real (Hyperliquid)|No|No|Sí|Parcial|**Sí**|
|Leaderboard compradores/vendedores|No|No|No|No|**Sí**|
|Etiquetado y clustering de direcciones|No|Etiquetado (sin clustering)|No|No|**Sí**|
|Alertas de precio con webhook|Sí (lenta)|No|Sí (sin webhook nativo)|No|**Sí**|
|Velocidad adecuada para Hyperliquid|No|N/A|N/A|Variable|**Sí**|
|Interfaz integrada|Sí|Sí|Sí|No|**Sí**|

</div>

---

### Justificación de la propuesta

Del análisis realizado se desprende que:

<div align=center>

|Solución|Conclusión|
|-|-|
|**Cielo Finance**|Ofrece un sistema de alertas pero con una velocidad insuficiente para el ecosistema de Hyperliquid. No cubre análisis de actividad ni seguimiento de precios.|
|**Hypurrscan**|Permite etiquetar direcciones, pero carece por completo de sistema de alertas, leaderboards configurables y seguimiento de precios en tiempo real.|
|**TradingView**|Proporciona alertas de precio y gráficos, pero sin ninguna funcionalidad on-chain (tracking de direcciones, leaderboards, clustering).|
|**Herramientas de la comunidad**|Soluciones aisladas, fragmentadas y sin mantenimiento, que no cubren las necesidades de forma integrada.|

</div>

> **No existe una solución que integre de forma nativa el seguimiento de precios en tiempo real, un leaderboard de actividad con etiquetado y clustering de direcciones, y un sistema de alertas de precio con webhook, todo ello construido específicamente sobre la L1 de Hyperliquid.** Esta carencia solo puede resolverse mediante una solución a medida, sin competidor directo ni alternativa open-source viable en el ecosistema.

---

### Escalabilidad futura

La solución propuesta consume los datos expuestos por la L1 de Hyperliquid a través de sus interfaces públicas (API REST y WebSocket). Este enfoque es adecuado para el alcance de un TFG. Para escenarios que requieran mayor throughput, la arquitectura de Hyperliquid permite ejecutar un nodo no validador que recibe datos directamente de la blockchain sin restricciones. Se contemplan dos ejes de crecimiento:

<div align=center>

|Eje|Descripción|
|-|-|
|**Infraestructura**|Ejecución de un *nodo no validador* de Hyperliquid para recibir el flujo completo de datos directamente de la blockchain, sin las restricciones de la API pública|
|**Nuevas herramientas**|Incorporación de herramientas adicionales, como el monitoreo de posiciones en protocolos desplegados en HyperEVM — por ejemplo, protocolos de lending donde interesa vigilar posiciones grandes con un *health rate* bajo que estén próximas a liquidación|
|**Más tipos de alertas**|Ampliación del sistema de alertas más allá del precio: alertas por movimientos de direcciones específicas, por cambios en el interés abierto, o por eventos en protocolos de HyperEVM|

</div>
