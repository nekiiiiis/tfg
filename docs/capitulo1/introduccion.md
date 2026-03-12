# Introducción, escenario y marco teórico

### El problema de los exchanges centralizados

El comercio de criptoactivos está dominado por exchanges centralizados (CEXs) como Binance, Coinbase o Bybit. Estos operan con un modelo de libro de órdenes (*order book*) en el que los usuarios envían órdenes de compra y venta que la plataforma empareja internamente. Es el mismo modelo que utilizan las bolsas de valores tradicionales y ofrece un rendimiento excelente: descubrimiento de precios eficiente, baja latencia y órdenes avanzadas (limit, stop-loss, TWAP, etc.).

Sin embargo, los CEXs presentan un problema estructural: **la opacidad**. El libro de órdenes, las posiciones de los usuarios, los precios de liquidación, el flujo de órdenes y los datos internos del mercado son privados. Solo la plataforma tiene acceso completo a esta información. Esto genera una asimetría de información fundamental: el operador del exchange posee una visión privilegiada del mercado que ningún participante puede verificar ni auditar (Madhavan, 2000).

Las consecuencias de esta opacidad son bien conocidas en el ecosistema:

<div align=center>

|Problema|Descripción|
|-|-|
|**Custodia centralizada**|El exchange custodia los fondos del usuario. Historial de quiebras y fraudes (FTX, Mt. Gox) que resultaron en pérdidas multimillonarias|
|**Asimetría de información**|La plataforma ve precios de liquidación, posiciones abiertas y flujo de órdenes de todos los participantes — los usuarios no|
|**Opacidad del matching**|El motor de emparejamiento es privado. No es verificable si el exchange ejecuta las órdenes de forma justa o si existe front-running interno|
|**Riesgo regulatorio y de contraparte**|Los fondos dependen de la solvencia y el cumplimiento regulatorio de una entidad centralizada|

</div>

---

### Exchanges descentralizados: transparencia a costa de rendimiento

Los exchanges descentralizados (DEXs) nacieron como respuesta a estos problemas. Un DEX ejecuta las operaciones directamente entre usuarios a través de contratos inteligentes desplegados en redes blockchain, eliminando el intermediario centralizado: el usuario mantiene la custodia de sus fondos y todas las transacciones son públicas y verificables on-chain.

Sin embargo, los primeros DEXs —basados en el modelo AMM (*Automated Market Makers*), popularizado por Uniswap— sacrificaban rendimiento a cambio de descentralización. Los AMMs utilizan pools de liquidez con fórmulas matemáticas para determinar precios, lo que introduce ineficiencias inherentes (deslizamiento, pérdida impermanente) que los hacen inadecuados para operadores profesionales. No ofrecen un libro de órdenes real ni la velocidad necesaria para estrategias avanzadas de trading.

El resultado: durante años, los operadores profesionales —market makers, traders de alta frecuencia, fondos— permanecieron en los CEXs porque ningún DEX podía igualar su rendimiento. Los DEXs representaban en torno al 5% del volumen total de negociación a finales de 2025 (CoinBureau, 2025).

---

### Hyperliquid: rendimiento de CEX con transparencia on-chain

Hyperliquid es una blockchain de Capa 1 (L1) diseñada desde cero para resolver esta dicotomía. Su propuesta es directa: un libro de órdenes completo, con el rendimiento de un CEX, pero **completamente on-chain y transparente** — todo el estado (posiciones, liquidaciones, flujo de órdenes) es público y verificable por cualquier participante (HypeWatch, 2026).

La decisión arquitectónica clave de Hyperliquid es la separación de su sistema en **dos motores de ejecución independientes** bajo un mismo consenso (Zealynx, 2026). En una blockchain convencional, contratos inteligentes y lógica financiera compiten por el mismo espacio de bloque, lo que introduce latencia y contención de gas. Hyperliquid elimina este cuello de botella:

<div align=center>

|Capa|Componente|Función|
|-|-|-|
|**Consenso**|**HyperBFT**|Algoritmo de consenso derivado de HotStuff. Todos los nodos acuerdan qué bloque viene a continuación, qué contiene y cuándo es final. Proporciona finalidad instantánea (los bloques finalizados no pueden revertirse — sin *reorgs*), tolerancia a fallos bizantinos de hasta 1/3 de validadores, y baja latencia al no requerir comunicación constante entre todos los validadores.|
|**Motor financiero**|**HyperCore**|La máquina de estados financiera de la L1. No es un contrato inteligente ni compite por gas: está integrada directamente en el protocolo. Contiene el motor de emparejamiento (*matching engine*), el *clearinghouse* (actualización de posiciones, balances, márgenes, PnL y liquidaciones), los libros de órdenes de spot y perpetuos, oráculos de precios nativos y la gobernanza del protocolo. Todo su estado es **transparente y verificable on-chain**.|
|**Motor de contratos**|**HyperEVM**|Entorno *permissionless* compatible con la EVM de Ethereum. Los desarrolladores despliegan contratos inteligentes que **observan** el estado financiero de HyperCore (precios, posiciones, trades) pero **no lo modifican** directamente. Aquí se construyen protocolos DeFi (lending, stablecoins, vaults) sin poner en riesgo el motor financiero.|

</div>

Esta separación es la clave: las operaciones de trading no compiten con la ejecución de contratos inteligentes por espacio de bloque. HyperCore procesa las órdenes de forma determinista bloque a bloque, y solo después HyperEVM ejecuta la lógica de contratos sobre el estado financiero ya finalizado (Zealynx, 2026).

En términos de rendimiento, Hyperliquid alcanza una latencia mediana de ejecución de 0,2 segundos y un throughput teórico de 200.000 órdenes por segundo (The Biggish, 2025), con finalidad instantánea — una vez que un bloque se finaliza, no puede revertirse.

<div align=center>

|CEX (ej. Binance)|Hyperliquid|
|-|-|
|Order book privado|Order book **on-chain y público**|
|Custodia centralizada de fondos|Self-custody (el usuario controla sus claves)|
|Posiciones, liquidaciones y flujo de órdenes **opacos**|Todo el estado es **transparente y verificable**|
|Motor de matching privado y no auditable|Matching determinista ejecutado por todos los nodos del consenso|
|Latencia ~1–5 ms|Latencia <1 ms matching / ~200 ms settlement|

</div>

#### Dominio del mercado

Hyperliquid ha demostrado que esta propuesta funciona. No solo domina el segmento de derivados descentralizados, sino que ha comenzado a competir en volumen con CEXs de primer nivel:

<div align=center>

||2025|Inicio 2026|
|-|-|-|
|Volumen anual/diario|~2,95 billones USD anuales / picos de 32.000 M USD diarios|5.000–12.000 M USD diarios|
|Cuota de mercado (derivados DEX)|>80%|~70% del interés abierto|
|Ingresos|844 M USD|—|
|Interés abierto / TVL|—|>4.900 M USD / ~2.800 M USD|

</div>

<div align=right>

*Fuentes: BlockEden (2026), Blockonomi (2025), HypeWatch (2026)*

</div>

Para poner estas cifras en perspectiva, el volumen diario de negociación en el conjunto de los DEXs alcanzó aproximadamente 13.500 millones de dólares a finales de 2025 (CoinBureau, 2025). Hyperliquid, por sí sola, ha llegado a superar esa cifra en picos de actividad, demostrando que su modelo atrae a operadores profesionales que tradicionalmente operaban exclusivamente en CEXs.

#### Innovación continua: HIP-3 y HIP-4

Más allá de su rendimiento técnico, Hyperliquid está ampliando los límites de lo que un exchange descentralizado puede ofrecer mediante sus propuestas de mejora (HIPs):

<div align=center>

|HIP|Descripción|Impacto|
|-|-|-|
|**HIP-3** (oct. 2025)|Despliegue *permissionless* de mercados de perpetuos. Cualquier builder que cumpla los requisitos de staking puede listar nuevos activos en HyperCore sin necesidad de aprobación centralizada.|Más de 13.000 M USD en volumen acumulado de mercados desplegados por terceros en sus primeros 3 meses. El volumen de la plataforma pasó de 3.750 M USD/día a 12.000 M USD/día en una sola semana tras su activación.|
|**HIP-4** (feb. 2026)|Integración nativa de *prediction markets* ("Outcomes"). Contratos de resultados completamente colateralizados, sin riesgo de liquidación, que se liquidan en USDH y comparten la infraestructura de márgenes existente.|Posiciona a Hyperliquid como competidor directo de plataformas de predicción como Polymarket y Kalshi, con estimaciones de volumen mensual de entre 28.000 y 40.000 M USD con adopción moderada a fuerte.|

</div>

Estas propuestas demuestran que Hyperliquid no es solo un exchange de alto rendimiento, sino una plataforma en expansión que atrae cada vez a más participantes y tipos de mercado, consolidando un ecosistema donde los datos disponibles —precios, actividad de direcciones, nuevos mercados— crecen continuamente en volumen y complejidad.

---

### Market making y HFT: viables en un DEX por primera vez

El market making es una actividad esencial para el funcionamiento eficiente de cualquier mercado financiero. Los market makers proporcionan liquidez colocando simultáneamente órdenes de compra y venta en el libro de órdenes, obteniendo beneficios del diferencial (*spread*) entre ambos precios (Madhavan, 2000).

El trading de alta frecuencia (HFT, *High-Frequency Trading*) lleva esta actividad un paso más allá, utilizando sistemas automatizados capaces de ejecutar un gran número de operaciones en fracciones de segundo. Las estrategias de HFT dependen críticamente de la velocidad de acceso a los datos del mercado, la latencia en la ejecución de órdenes y la capacidad de procesamiento de grandes volúmenes de información en tiempo real (Aldridge, 2013).

Hasta la aparición de Hyperliquid, el market making y el HFT estaban confinados a los CEXs, aceptando la opacidad como coste inevitable del rendimiento. Hyperliquid rompe esta dicotomía:

<div align=center>

|Plataforma|Latencia|Arquitectura|Viabilidad HFT|
|-|-|-|-|
|**Hyperliquid**|<1 ms matching / ~200 ms settlement|Custom L1 CLOB (HyperCore)|9.5/10|
|Grvt|<2 ms matching|zkSync L3 Validium|9.0/10|
|dYdX v4|~10-50 ms|Cosmos AppChain CLOB|8.5/10|
|Drift|~50-200 ms|Solana vAMM+JIT|7.5/10|

</div>

<div align=right>

*Fuente: Decentralised News (2025)*

</div>

Hyperliquid se posiciona como el primer DEX donde las empresas de market making y HFT pueden operar con condiciones competitivas reales — y con la ventaja añadida de la transparencia total del estado del mercado.

---

### Acceso a los datos de la L1

La transparencia on-chain de Hyperliquid no es solo un principio: se materializa en interfaces de datos públicas. Hyperliquid expone los datos de su blockchain a través de una **API REST** para consultas puntuales y conexiones **WebSocket** para la recepción de datos en flujo continuo (Hyperliquid Docs, s.f.).

<div align=center>

|Tipo de dato|Método de acceso|Ejemplos|
|-|-|-|
|Precios de mercado|REST y WebSocket|Mid prices de todos los activos listados, en tiempo real|
|Libro de órdenes|WebSocket|Best bid/ask, profundidad, snapshots e incrementales|
|Actividad de direcciones|REST|Posiciones abiertas, historial de trades, órdenes activas de cualquier dirección pública|
|Datos de mercado agregados|REST|Funding rates, interés abierto, metadatos de activos|

</div>

Es precisamente esta transparencia — los datos que en un CEX serían opacos y privados — la que permite construir herramientas externas que aprovechen la información del mercado de formas imposibles en un exchange centralizado.

Estas interfaces públicas imponen **rate limits** que restringen el número de peticiones por intervalo de tiempo. Para escenarios que requieran mayor throughput —como la monitorización de un gran número de direcciones o el envío masivo de alertas—, la arquitectura de Hyperliquid permite la ejecución de un **nodo no validador** (*non-validator node*). Un nodo no validador se sincroniza directamente con la blockchain, recibiendo el flujo completo de datos de la L1 sin pasar por la API pública y, por tanto, sin estar sujeto a sus restricciones.

---

### El escenario: necesidad de herramientas especializadas

Las empresas de market making y HFT que operan en Hyperliquid tienen, por primera vez en un DEX, acceso a datos que en un CEX serían privados: posiciones, flujo de órdenes, actividad de direcciones individuales. Sin embargo, los datos en bruto no son suficientes — necesitan herramientas que los transformen en información accionable. **Infinite Fieldx**, una empresa dedicada al market making y al HFT en este ecosistema, ha identificado la necesidad de tres herramientas que actualmente no existen de forma integrada:

<div align=center>

|Herramienta|Necesidad|Descripción|
|-|-|-|
|**Precios en tiempo real**|Monitorizar los precios de los tokens de Hyperliquid de forma continua|Visualización en tiempo real del precio de todos los activos perpetuos listados en la plataforma|
|**Leaderboard de actividad**|Identificar los mayores compradores y vendedores de un token en un periodo configurable|Clasificación de direcciones por volumen de compra/venta en un timeframe dado, con la posibilidad de **etiquetar direcciones** conocidas y agruparlas en **clusters** para que, al consultar el leaderboard, las direcciones etiquetadas muestren su nombre asociado|
|**Alertas de precio con webhook**|Recibir notificaciones automáticas cuando un token alcance o supere un umbral de precio definido|Sistema de alertas configurables por el usuario, con envío de notificaciones a través de webhooks cuando el precio de un token cumpla las condiciones establecidas|

</div>

<div align=center>

|Problema|Descripción|
|-|-|
|Ausencia de herramientas integradas|No existe una solución que combine estas tres funcionalidades de forma nativa para Hyperliquid|
|Competidores parciales e insuficientes|Las alternativas existentes (Cielo Finance, Hypurrscan) cubren funcionalidades aisladas con limitaciones significativas (velocidad insuficiente, ausencia de alertas)|
|Sin alternativa open-source viable|No existe un proyecto de código abierto que cubra estas necesidades para el ecosistema de Hyperliquid|
|Necesidad de solución a medida|La combinación de velocidad, personalización y funcionalidades requeridas solo es alcanzable mediante un desarrollo ad-hoc|

</div>

> Este escenario plantea la necesidad de desarrollar una **solución a medida** que integre seguimiento de precios, análisis de actividad por dirección y alertas configurables, construida sobre los datos transparentes de la L1 de Hyperliquid.
