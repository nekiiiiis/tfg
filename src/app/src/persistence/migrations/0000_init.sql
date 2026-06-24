CREATE TYPE "public"."cruce" AS ENUM('SUBE', 'BAJA');--> statement-breakpoint
CREATE TYPE "public"."estado_alerta" AS ENUM('OPERATIVA', 'DISPARADA', 'NOTIFICACION_FALLIDA');--> statement-breakpoint
CREATE TYPE "public"."estado_entrega" AS ENUM('PENDIENTE', 'ENTREGADA', 'FALLIDA');--> statement-breakpoint
CREATE TABLE "entidades" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nombre" varchar(64) NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizada" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "entidades_nombre_unico" UNIQUE("nombre"),
	CONSTRAINT "entidades_nombre_no_vacio" CHECK (length(trim("entidades"."nombre")) > 0)
);
--> statement-breakpoint
CREATE TABLE "direcciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"valor" char(42) NOT NULL,
	"entidad_id" uuid NOT NULL,
	"aniadida_en" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "direcciones_valor_unico" UNIQUE("valor"),
	CONSTRAINT "direcciones_formato" CHECK ("direcciones"."valor" ~ '^0x[a-f0-9]{40}$')
);
--> statement-breakpoint
CREATE TABLE "alertas" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"token_simbolo" varchar(16) NOT NULL,
	"mercado" varchar(16) NOT NULL,
	"umbral_valor" numeric(28, 8) NOT NULL,
	"umbral_cruce" "cruce" NOT NULL,
	"webhook_url_enc" "bytea" NOT NULL,
	"estado" "estado_alerta" DEFAULT 'OPERATIVA' NOT NULL,
	"creada_en" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_disparo" timestamp with time zone,
	"ultimo_intento" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "notificaciones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"alerta_id" uuid NOT NULL,
	"precio_disparador" numeric(28, 8) NOT NULL,
	"instante_emision" timestamp with time zone DEFAULT now() NOT NULL,
	"estado" "estado_entrega" DEFAULT 'PENDIENTE' NOT NULL,
	"intento" integer DEFAULT 1 NOT NULL,
	"proximo_intento" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_error" text,
	"entregada_en" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "direcciones" ADD CONSTRAINT "direcciones_entidad_id_entidades_id_fk" FOREIGN KEY ("entidad_id") REFERENCES "public"."entidades"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificaciones" ADD CONSTRAINT "notificaciones_alerta_id_alertas_id_fk" FOREIGN KEY ("alerta_id") REFERENCES "public"."alertas"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direcciones_entidad" ON "direcciones" USING btree ("entidad_id");--> statement-breakpoint
CREATE INDEX "alertas_token_estado" ON "alertas" USING btree ("token_simbolo","estado");--> statement-breakpoint
CREATE INDEX "notif_alerta" ON "notificaciones" USING btree ("alerta_id","instante_emision");--> statement-breakpoint
CREATE INDEX "notif_pendientes_proximas" ON "notificaciones" USING btree ("estado","proximo_intento");