CREATE TABLE "items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sku" text NOT NULL,
	"name" text NOT NULL,
	"location" text NOT NULL,
	"unit" text NOT NULL,
	"quantity_on_hand" integer DEFAULT 0 NOT NULL,
	"reorder_point" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "items_quantity_on_hand_not_negative" CHECK ("items"."quantity_on_hand" >= 0),
	CONSTRAINT "items_reorder_point_not_negative" CHECK ("items"."reorder_point" >= 0)
);
--> statement-breakpoint
CREATE TABLE "low_stock_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"checked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"item_count" integer NOT NULL,
	"items" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stock_movements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"item_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"quantity_change" integer NOT NULL,
	"note" text NOT NULL,
	"actor_id" text NOT NULL,
	"actor_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_movements_kind_sign" CHECK (("stock_movements"."kind" = 'in' AND "stock_movements"."quantity_change" > 0)
    OR ("stock_movements"."kind" = 'out' AND "stock_movements"."quantity_change" < 0)
    OR ("stock_movements"."kind" = 'adjustment' AND "stock_movements"."quantity_change" <> 0))
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "items_sku_idx" ON "items" USING btree ("sku");--> statement-breakpoint
CREATE INDEX "low_stock_reports_checked_at_idx" ON "low_stock_reports" USING btree ("checked_at");--> statement-breakpoint
CREATE INDEX "stock_movements_item_id_created_at_idx" ON "stock_movements" USING btree ("item_id","created_at");