ALTER TABLE "quotes" ADD COLUMN "share_token" text;--> statement-breakpoint
CREATE UNIQUE INDEX "quotes_share_token_key" ON "quotes" USING btree ("share_token");