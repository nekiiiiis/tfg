# Estado del arte

En la introducción se ha descrito cómo Hyperliquid expone de forma pública y transparente datos que en un exchange centralizado serían privados: precios, libros de órdenes, posiciones, actividad de direcciones individuales y métricas de mercado agregadas. Esta transparencia abre la puerta a construir herramientas externas que aprovechen esa información, algo imposible en un CEX.

Sin embargo, que los datos estén disponibles no implica que existan herramientas que los exploten de forma adecuada. A continuación se analizan las soluciones más relevantes que operan actualmente en el ecosistema de Hyperliquid o que podrían aplicarse a él, evaluando en qué medida cubren las tres necesidades identificadas: seguimiento de precios en tiempo real, leaderboard de actividad con etiquetado y clustering de direcciones, y alertas de precio con webhook.

---

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
- **Modelo de pago.** Las funcionalidades avanzadas de Cielo Finance requieren una suscripción de pago, lo que añade un coste recurrente sin resolver los problemas de velocidad ni de cobertura funcional para Hyperliquid.
- **Sin funcionalidades de análisis de actividad.** No ofrece leaderboards de compradores/vendedores ni clasificación de direcciones por volumen en un periodo determinado.
- **Sin seguimiento de precios en tiempo real.** No proporciona un dashboard de precios de los activos de Hyperliquid actualizado en tiempo real.

---

Mientras que Cielo Finance aborda la capa de alertas sin la velocidad necesaria para Hyperliquid, la siguiente herramienta analizada se centra específicamente en este ecosistema, aunque desde una perspectiva distinta.

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

---

Las dos herramientas anteriores pertenecen al ecosistema cripto nativo. Fuera de él, existen plataformas generalistas de análisis financiero que también ofrecen funcionalidades parcialmente relevantes.

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

- **Modelo de pago.** Las alertas de TradingView están limitadas en su plan gratuito (una sola alerta activa). Para un uso profesional con múltiples alertas simultáneas se requiere una suscripción premium, lo que implica un coste recurrente significativo.
- **Velocidad no competitiva para Hyperliquid.** TradingView consume datos de precio agregados con un retardo inherente al tratamiento de datos OHLCV. No accede directamente a los datos de la L1 ni a los WebSockets de Hyperliquid, por lo que las alertas y los datos mostrados no compiten en velocidad con una solución que consuma datos en tiempo real desde la propia blockchain.
- **Sin análisis de actividad por dirección.** Trabaja exclusivamente con datos de precio agregados (OHLCV), sin acceso a la actividad individual de direcciones.
- **Sin leaderboard ni etiquetado de direcciones.** No tiene concepto de análisis on-chain ni de tracking de wallets.

---

### Análisis comparativo

Una vez examinadas las soluciones disponibles de forma individual, resulta necesario contrastarlas de forma conjunta frente a los requisitos del escenario descrito. La siguiente tabla sintetiza en qué medida cada alternativa cubre las funcionalidades requeridas.

<div align=center>

**Tabla 1.** Comparativa de soluciones existentes frente a las necesidades del escenario.

|Criterio|Cielo Finance|Hypurrscan|TradingView|**Solución propuesta**|
|-|-|-|-|-|
|Precios en tiempo real (Hyperliquid)|No|Sí|Sí|**Sí**|
|Leaderboard compradores/vendedores|No|No|No|**Sí**|
|Etiquetado y clustering de direcciones|No|Sí|No|**Sí**|
|Alertas de precio con webhook|Sí (lenta)|No|Sí (sin webhook nativo)|**Sí**|
|Velocidad competitiva para Hyperliquid|No|N/A|No|**Sí**|
|Sin coste de suscripción|No|Sí|No|**Sí**|
|Interfaz integrada|Sí|Sí|Sí|**Sí**|

</div>

---

### Justificación de la propuesta

La tabla anterior evidencia un patrón claro: cada herramienta cubre alguna funcionalidad de forma parcial, pero ninguna las integra todas. A esto se suma que las dos plataformas que ofrecen alertas (Cielo Finance y TradingView) requieren suscripciones de pago y, aun así, no alcanzan la velocidad necesaria para ser competitivas en el ecosistema de Hyperliquid ni muestran los datos relevantes para el escenario descrito. Del análisis realizado se desprende que:

<div align=center>

|Solución|Conclusión|
|-|-|
|**Cielo Finance**|Ofrece alertas DeFi de pago, pero con una velocidad insuficiente para Hyperliquid. No cubre análisis de actividad ni seguimiento de precios.|
|**Hypurrscan**|Permite etiquetar direcciones y es gratuito, pero carece por completo de sistema de alertas, leaderboards configurables y clustering.|
|**TradingView**|Proporciona alertas de precio y gráficos de pago, pero sin velocidad competitiva para Hyperliquid ni funcionalidad on-chain alguna (tracking de direcciones, leaderboards, clustering).|

</div>

> **No existe una solución que integre de forma nativa el seguimiento de precios en tiempo real, un leaderboard de actividad con etiquetado y clustering de direcciones, y un sistema de alertas de precio con webhook, todo ello construido específicamente sobre la L1 de Hyperliquid con velocidad competitiva y sin coste de suscripción.** El potencial de la solución propuesta reside precisamente en unificar estas funcionalidades en una única interfaz, consumiendo los datos directamente desde la L1 con la latencia que el ecosistema exige — algo que ninguna alternativa existente ofrece. Esta carencia solo puede resolverse mediante una solución a medida.

---

### Escalabilidad futura

Más allá del alcance inmediato del proyecto, la arquitectura de Hyperliquid y la naturaleza modular de la solución propuesta permiten contemplar vías de crecimiento concretas.

La solución propuesta consume los datos expuestos por la L1 de Hyperliquid a través de sus interfaces públicas (API REST y WebSocket). Este enfoque es adecuado para el alcance de un TFG. Para escenarios que requieran mayor throughput, la arquitectura de Hyperliquid permite ejecutar un nodo no validador que recibe datos directamente de la blockchain sin restricciones. Se contemplan dos ejes de crecimiento:

<div align=center>

|Eje|Descripción|
|-|-|
|**Infraestructura**|Ejecución de un *nodo no validador* de Hyperliquid para recibir el flujo completo de datos directamente de la blockchain, sin las restricciones de la API pública|
|**Nuevas herramientas**|Incorporación de herramientas adicionales, como el monitoreo de posiciones en protocolos desplegados en HyperEVM — por ejemplo, protocolos de lending donde interesa vigilar posiciones grandes con un *health rate* bajo que estén próximas a liquidación|
|**Más tipos de alertas**|Ampliación del sistema de alertas más allá del precio: alertas por movimientos de direcciones específicas, por cambios en el interés abierto, o por eventos en protocolos de HyperEVM|

</div>
