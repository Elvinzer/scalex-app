ALTER TABLE "sales" ADD COLUMN "parent_sale_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_number" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "payment_count" integer;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_parent_sale_id_sales_id_fk" FOREIGN KEY ("parent_sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sales_parent_sale_idx" ON "sales" USING btree ("parent_sale_id");--> statement-breakpoint
CREATE UNIQUE INDEX "sales_parent_payment_idx" ON "sales" USING btree ("parent_sale_id","payment_number");