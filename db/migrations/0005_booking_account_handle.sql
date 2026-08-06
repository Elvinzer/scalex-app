ALTER TABLE "users" ADD COLUMN "booking_handle" text;--> statement-breakpoint
CREATE UNIQUE INDEX "users_booking_handle_idx" ON "users" USING btree ("booking_handle") WHERE booking_handle is not null;