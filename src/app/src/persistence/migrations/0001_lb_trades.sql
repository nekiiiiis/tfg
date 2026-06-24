CREATE TABLE IF NOT EXISTS "lb_trades" (
	"tid" text PRIMARY KEY NOT NULL,
	"mercado" varchar(16) NOT NULL,
	"token" varchar(64) NOT NULL,
	"direccion" char(42) NOT NULL,
	"lado" varchar(4) NOT NULL,
	"volumen_usd" double precision NOT NULL,
	"ts" double precision NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lb_trades_ventana" ON "lb_trades" USING btree ("mercado","token","ts");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lb_trades_ts" ON "lb_trades" USING btree ("ts");
