/**
 * Predicado puro de evaluación de alertas. Sin BD, sin red — testeable a solas.
 *
 * Reutiliza `evaluarUmbral` del dominio. La separación facilita instanciar
 * nuevos tipos de alerta (extensible por OCP — RS-04) sin tocar el subscriber.
 */

import { evaluarUmbral, type Precio, type Umbral } from '../../domain/types.ts';

export interface AlertaEvaluable {
  id: string;
  umbral: Umbral;
}

export function evaluarAlertasContraPrecio(
  alertas: ReadonlyArray<AlertaEvaluable>,
  precio: Precio,
): string[] {
  const disparadas: string[] = [];
  for (const a of alertas) {
    if (evaluarUmbral(a.umbral, precio)) disparadas.push(a.id);
  }
  return disparadas;
}
