/**
 * Adaptador hacia el actor externo `Servicio Webhook`.
 *
 *  - `checkReachability(url)`: HEAD (con fallback a GET) para sondear el endpoint.
 *  - `transmit(url, payload)`: POST JSON crudo (webhooks genéricos).
 *  - `transmitAlerta(url, alerta)`: envía la alerta adaptando el cuerpo al
 *    receptor según su host (p. ej. Discord requiere `{ content, embeds }`,
 *    no acepta JSON arbitrario).
 *
 * El cifrado/descifrado de la URL ocurre en el repositorio de `alertas`, no
 * aquí (RS-10).
 */

import { logger } from '../../shared/logger.ts';

export interface ReachabilityResult {
  ok: boolean;
  status?: number;
  message?: string;
}

export interface TransmitResult {
  ok: boolean;
  status: number;
  bodySnippet?: string;
  error?: string;
}

/**
 * Payload del dominio para una alerta disparada. Es el contrato genérico que
 * usan los webhooks no específicos (webhook.site, Zapier, n8n, etc.).
 */
export interface AlertaWebhookPayload {
  alertaId: string;
  notificacionId: string;
  token: string;
  mercado: string;
  umbral: { cruce: 'SUBE' | 'BAJA'; valor: number };
  precioDisparador: number;
  intento: number;
  instanteEmision: string;
}

const REACH_TIMEOUT_MS = 5_000;
const TRANSMIT_TIMEOUT_MS = 10_000;

export class WebhookConnector {
  async checkReachability(rawUrl: string): Promise<ReachabilityResult> {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return { ok: false, message: 'URL inválida' };
    }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') {
      return { ok: false, message: 'Protocolo no soportado' };
    }
    try {
      let res = await fetch(rawUrl, {
        method: 'HEAD',
        signal: AbortSignal.timeout(REACH_TIMEOUT_MS),
      });
      // Algunos webhooks devuelven 405 a HEAD; fallback a GET.
      if (res.status === 405 || res.status === 501) {
        res = await fetch(rawUrl, {
          method: 'GET',
          signal: AbortSignal.timeout(REACH_TIMEOUT_MS),
        });
      }
      return {
        ok: res.status < 500,
        status: res.status,
      };
    } catch (err) {
      return { ok: false, message: (err as Error).message };
    }
  }

  /**
   * Envía una alerta a su webhook destino. Elige el formato del cuerpo en
   * función del host: Discord requiere su propio esquema (`content`/`embeds`);
   * el resto recibe el payload del dominio tal cual.
   */
  async transmitAlerta(
    rawUrl: string,
    payload: AlertaWebhookPayload,
  ): Promise<TransmitResult> {
    const body = this.isDiscord(rawUrl) ? this.toDiscordPayload(payload) : payload;
    return this.transmit(rawUrl, body);
  }

  async transmit(rawUrl: string, payload: unknown): Promise<TransmitResult> {
    try {
      const res = await fetch(rawUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(TRANSMIT_TIMEOUT_MS),
      });
      const text = await res.text().catch(() => '');
      return {
        ok: res.ok,
        status: res.status,
        bodySnippet: text.slice(0, 200),
      };
    } catch (err) {
      logger.warn({ err: String(err) }, 'Webhook transmit failed');
      return {
        ok: false,
        status: 0,
        error: (err as Error).message,
      };
    }
  }

  private isDiscord(rawUrl: string): boolean {
    try {
      const host = new URL(rawUrl).host.toLowerCase();
      return (
        host === 'discord.com' ||
        host === 'discordapp.com' ||
        host.endsWith('.discord.com') ||
        host.endsWith('.discordapp.com')
      );
    } catch {
      return false;
    }
  }

  private toDiscordPayload(p: AlertaWebhookPayload): unknown {
    const sentido = p.umbral.cruce === 'SUBE' ? '≥' : '≤';
    const color = p.umbral.cruce === 'SUBE' ? 0x2ecc71 : 0xe74c3c;
    const mercadoLabel =
      p.mercado === 'PerpNativo'
        ? 'Perpetuos'
        : p.mercado === 'PerpHIP3'
          ? 'Perp HIP-3'
          : p.mercado;
    return {
      username: 'Hyperliquid Leaderboard — Alertas',
      content: `Alerta disparada: **${p.token}** ${sentido} ${p.umbral.valor} (precio ${p.precioDisparador})`,
      embeds: [
        {
          title: `Alerta disparada — ${p.token}`,
          description: `Precio actual **${p.precioDisparador}** ${sentido} umbral **${p.umbral.valor}**`,
          color,
          fields: [
            { name: 'Mercado', value: mercadoLabel, inline: true },
            { name: 'Cruce', value: p.umbral.cruce, inline: true },
            { name: 'Intento', value: String(p.intento), inline: true },
            { name: 'Alerta', value: `\`${p.alertaId}\``, inline: false },
          ],
          timestamp: p.instanteEmision,
          footer: { text: `notificacionId: ${p.notificacionId}` },
        },
      ],
    };
  }
}
