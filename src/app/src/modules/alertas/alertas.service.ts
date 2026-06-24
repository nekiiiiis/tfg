/**
 * Servicio de Alertas (CU-09..CU-12).
 *
 * Encapsula las operaciones CRUD sobre la tabla `alertas` aplicando las reglas
 * del dominio. La URL del webhook se cifra al insertar y se descifra solo
 * cuando se transmite (RS-10).
 */

import { and, asc, desc, eq, ilike, or, sql, type SQL } from 'drizzle-orm';
import type { DB } from '../../persistence/db.ts';
import { alertas, type Alerta } from '../../persistence/schema/alertas.ts';
import { encryptWebhook } from '../../persistence/crypto.ts';
import { config } from '../../config.ts';
import {
  AlertaNoEncontrada,
  TokenDesconocido,
  WebhookInvalido,
} from '../../domain/errors.ts';
import {
  ESTADOS_ALERTA,
  esTokenValido,
  MERCADOS,
  type Cruce,
  type EstadoAlerta,
  type Mercado,
  type TokenSymbol,
} from '../../domain/types.ts';
import type { WebhookConnector } from '../notificacion/webhook.connector.ts';
import { bus } from '../../bus.ts';

export interface CrearAlertaInput {
  token: TokenSymbol;
  mercado: Mercado;
  umbralValor: number;
  umbralCruce: Cruce;
  webhookUrl: string;
}

export interface EditarAlertaInput {
  token?: TokenSymbol;
  mercado?: Mercado;
  umbralValor?: number;
  umbralCruce?: Cruce;
  webhookUrl?: string;
}

export interface AlertaResumen {
  id: string;
  token: TokenSymbol;
  mercado: Mercado;
  umbralValor: number;
  umbralCruce: Cruce;
  estado: EstadoAlerta;
  creadaEn: string;
  ultimoDisparo: string | null;
  ultimoIntento: string | null;
  webhookHost: string;
}

export interface CrearAlertaResultado {
  alerta: AlertaResumen;
  webhookAlcanzable: boolean;
  webhookMensaje?: string;
}

export class AlertasService {
  constructor(
    private readonly db: DB,
    private readonly webhook: WebhookConnector,
  ) {}

  // ---- CU-09 ----
  async crear(input: CrearAlertaInput): Promise<CrearAlertaResultado> {
    this.validarToken(input.token);
    this.validarMercado(input.mercado);
    this.validarUmbral(input.umbralValor);
    const url = this.validarWebhook(input.webhookUrl);

    const reach = await this.webhook.checkReachability(input.webhookUrl);

    const [created] = await this.db
      .insert(alertas)
      .values({
        tokenSimbolo: input.token,
        mercado: input.mercado,
        umbralValor: input.umbralValor.toString(),
        umbralCruce: input.umbralCruce,
        webhookUrlEnc: encryptWebhook(input.webhookUrl) as unknown as Uint8Array,
        estado: 'OPERATIVA',
      })
      .returning();
    if (!created) throw new Error('Insert no devolvió fila');
    return {
      alerta: this.toResumen(created, url.host),
      webhookAlcanzable: reach.ok,
      webhookMensaje: reach.message,
    };
  }

  // ---- CU-10 ----
  async listar(opts: {
    estado?: EstadoAlerta;
    token?: TokenSymbol;
    page?: number;
    size?: number;
  } = {}): Promise<{
    items: AlertaResumen[];
    total: number;
    page: number;
    size: number;
  }> {
    const page = Math.max(1, opts.page ?? 1);
    const size = Math.min(200, Math.max(1, opts.size ?? 20));
    const where: SQL[] = [];
    if (opts.estado) where.push(eq(alertas.estado, opts.estado));
    if (opts.token) where.push(eq(alertas.tokenSimbolo, opts.token));
    const w = where.length > 0 ? and(...where) : undefined;

    // Trick: usamos SQL crudo para descifrar la URL solo para extraer el host.
    const rows = await this.db.execute<{
      id: string;
      token_simbolo: string;
      mercado: string;
      umbral_valor: string;
      umbral_cruce: 'SUBE' | 'BAJA';
      estado: EstadoAlerta;
      creada_en: Date;
      ultimo_disparo: Date | null;
      ultimo_intento: Date | null;
      url_clara: string;
    }>(sql`
      SELECT a.id, a.token_simbolo, a.mercado, a.umbral_valor::text, a.umbral_cruce,
             a.estado, a.creada_en, a.ultimo_disparo, a.ultimo_intento,
             pgp_sym_decrypt(a.webhook_url_enc::bytea, ${config.APP_SECRET}::text) AS url_clara
      FROM alertas a
      ${w ? sql`WHERE ${w}` : sql``}
      ORDER BY a.creada_en DESC
      LIMIT ${size} OFFSET ${(page - 1) * size}
    `);

    const totalRows = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(alertas)
      .where(w);
    const total = Number(totalRows[0]?.count ?? 0);

    const items = rows.map((r) => {
      let host = 'unknown';
      try {
        host = new URL(r.url_clara).host;
      } catch {
        host = 'inválido';
      }
      return this.toResumen(
        {
          id: r.id,
          tokenSimbolo: r.token_simbolo,
          mercado: r.mercado,
          umbralValor: r.umbral_valor,
          umbralCruce: r.umbral_cruce,
          estado: r.estado,
          creadaEn: r.creada_en,
          ultimoDisparo: r.ultimo_disparo,
          ultimoIntento: r.ultimo_intento,
          webhookUrlEnc: new Uint8Array(),
        },
        host,
      );
    });

    return { items, total, page, size };
  }

  async obtener(id: string): Promise<AlertaResumen> {
    const row = await this.cargarConHost(id);
    if (!row) throw new AlertaNoEncontrada(`Alerta ${id} no existe`);
    return row.resumen;
  }

  // ---- CU-11 ----
  async editar(id: string, input: EditarAlertaInput): Promise<CrearAlertaResultado> {
    const actual = await this.cargarConHost(id);
    if (!actual) throw new AlertaNoEncontrada(`Alerta ${id} no existe`);

    const updates: Record<string, unknown> = {};
    if (input.token !== undefined) {
      this.validarToken(input.token);
      updates['tokenSimbolo'] = input.token;
    }
    if (input.mercado !== undefined) {
      this.validarMercado(input.mercado);
      updates['mercado'] = input.mercado;
    }
    if (input.umbralValor !== undefined) {
      this.validarUmbral(input.umbralValor);
      updates['umbralValor'] = input.umbralValor.toString();
    }
    if (input.umbralCruce !== undefined) {
      updates['umbralCruce'] = input.umbralCruce;
    }
    let webhookAlcanzable = true;
    let webhookMensaje: string | undefined;
    if (input.webhookUrl !== undefined) {
      this.validarWebhook(input.webhookUrl);
      const reach = await this.webhook.checkReachability(input.webhookUrl);
      webhookAlcanzable = reach.ok;
      webhookMensaje = reach.message;
      updates['webhookUrlEnc'] = encryptWebhook(input.webhookUrl);
    }

    if (Object.keys(updates).length === 0) {
      return {
        alerta: actual.resumen,
        webhookAlcanzable: true,
      };
    }
    const [updated] = await this.db
      .update(alertas)
      .set(updates)
      .where(eq(alertas.id, id))
      .returning();
    if (!updated) throw new AlertaNoEncontrada(`Alerta ${id} no existe`);
    const host =
      input.webhookUrl !== undefined
        ? this.safeHost(input.webhookUrl)
        : actual.resumen.webhookHost;
    return {
      alerta: this.toResumen(updated, host),
      webhookAlcanzable,
      webhookMensaje,
    };
  }

  // ---- CU-12 ----
  async eliminar(id: string): Promise<void> {
    const r = await this.db
      .delete(alertas)
      .where(eq(alertas.id, id))
      .returning({ id: alertas.id });
    if (r.length === 0) throw new AlertaNoEncontrada(`Alerta ${id} no existe`);
  }

  // ---- CU-13 helpers ----
  /**
   * Recupera todas las alertas operativas para un token (consulta indexada).
   * Devuelve las alertas mínimas necesarias para evaluar el umbral.
   */
  async recuperarOperativasPorToken(token: TokenSymbol): Promise<
    Array<Pick<Alerta, 'id' | 'tokenSimbolo' | 'umbralValor' | 'umbralCruce' | 'estado'>>
  > {
    return await this.db
      .select({
        id: alertas.id,
        tokenSimbolo: alertas.tokenSimbolo,
        umbralValor: alertas.umbralValor,
        umbralCruce: alertas.umbralCruce,
        estado: alertas.estado,
      })
      .from(alertas)
      .where(and(eq(alertas.tokenSimbolo, token), eq(alertas.estado, 'OPERATIVA')));
  }

  async marcarComoDisparada(id: string): Promise<void> {
    await this.db
      .update(alertas)
      .set({ estado: 'DISPARADA', ultimoDisparo: new Date() })
      .where(eq(alertas.id, id));
    bus.emit('AlertaDisparada', {
      name: 'AlertaDisparada',
      ocurridoEn: Date.now(),
      alertaId: id,
      token: '',
      precioDisparador: 0,
    });
  }

  // ---- internos ----

  private validarToken(token: TokenSymbol): void {
    if (!esTokenValido(token)) {
      throw new TokenDesconocido(`Token con formato inválido: ${token}`);
    }
  }

  private validarMercado(m: Mercado): void {
    if (!MERCADOS.includes(m)) {
      throw new TokenDesconocido(`Mercado desconocido: ${m}`);
    }
  }

  private validarUmbral(v: number): void {
    if (!Number.isFinite(v) || v <= 0) {
      throw new WebhookInvalido('El umbral debe ser un número positivo');
    }
  }

  private validarWebhook(rawUrl: string): URL {
    try {
      const u = new URL(rawUrl);
      if (u.protocol !== 'http:' && u.protocol !== 'https:') {
        throw new Error('protocolo no soportado');
      }
      if (rawUrl.length > 2048) throw new Error('URL demasiado larga');
      return u;
    } catch (err) {
      throw new WebhookInvalido(`Webhook inválido: ${(err as Error).message}`);
    }
  }

  private safeHost(rawUrl: string): string {
    try {
      return new URL(rawUrl).host;
    } catch {
      return 'inválido';
    }
  }

  private toResumen(a: Alerta, host: string): AlertaResumen {
    return {
      id: a.id,
      token: a.tokenSimbolo,
      mercado: a.mercado as Mercado,
      umbralValor: Number(a.umbralValor),
      umbralCruce: a.umbralCruce as Cruce,
      estado: a.estado as EstadoAlerta,
      creadaEn: this.toIso(a.creadaEn) as string,
      ultimoDisparo: this.toIso(a.ultimoDisparo),
      ultimoIntento: this.toIso(a.ultimoIntento),
      webhookHost: host,
    };
  }

  /**
   * Normaliza un valor temporal a ISO-8601. Necesario porque las consultas
   * crudas con `db.execute(sql\`...\`)` no aplican los parsers de `timestamp`
   * de Drizzle: las columnas pueden llegar como `string` aunque el tipo
   * estático las anuncie como `Date`.
   */
  private toIso(v: unknown): string | null {
    if (v === null || v === undefined) return null;
    if (v instanceof Date) return v.toISOString();
    if (typeof v === 'string' || typeof v === 'number') {
      return new Date(v).toISOString();
    }
    throw new Error(`Valor temporal inesperado: ${String(v)}`);
  }

  private async cargarConHost(
    id: string,
  ): Promise<{ raw: Alerta; resumen: AlertaResumen } | null> {
    const rows = await this.db.execute<{
      id: string;
      token_simbolo: string;
      mercado: string;
      umbral_valor: string;
      umbral_cruce: 'SUBE' | 'BAJA';
      estado: EstadoAlerta;
      creada_en: Date;
      ultimo_disparo: Date | null;
      ultimo_intento: Date | null;
      url_clara: string;
    }>(sql`
      SELECT a.id, a.token_simbolo, a.mercado, a.umbral_valor::text, a.umbral_cruce,
             a.estado, a.creada_en, a.ultimo_disparo, a.ultimo_intento,
             pgp_sym_decrypt(a.webhook_url_enc::bytea, ${config.APP_SECRET}::text) AS url_clara
      FROM alertas a WHERE a.id = ${id} LIMIT 1
    `);
    const r = rows[0];
    if (!r) return null;
    const host = this.safeHost(r.url_clara);
    const raw: Alerta = {
      id: r.id,
      tokenSimbolo: r.token_simbolo,
      mercado: r.mercado,
      umbralValor: r.umbral_valor,
      umbralCruce: r.umbral_cruce,
      estado: r.estado,
      creadaEn: r.creada_en,
      ultimoDisparo: r.ultimo_disparo,
      ultimoIntento: r.ultimo_intento,
      webhookUrlEnc: new Uint8Array(),
    };
    return { raw, resumen: this.toResumen(raw, host) };
  }
}

// Silenciar imports no usados que mantenemos por simetría futura.
void asc;
void desc;
void ilike;
void or;
void ESTADOS_ALERTA;
