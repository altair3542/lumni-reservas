CREATE TYPE "public"."booking_status" AS ENUM('draft', 'confirmed', 'completed', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."message_role" AS ENUM('user', 'assistant');--> statement-breakpoint
CREATE TYPE "public"."room_size" AS ENUM('small', 'medium', 'large');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('client', 'admin');--> statement-breakpoint
CREATE TABLE "booking_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"concept" text NOT NULL,
	"amount_cop" integer NOT NULL,
	CONSTRAINT "booking_lines_concept_unique" UNIQUE("booking_id","concept")
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"create_request_hash" text NOT NULL,
	"status" "booking_status" DEFAULT 'draft' NOT NULL,
	"wizard_step" integer DEFAULT 1 NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"customer" jsonb,
	"room_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"service_codes" jsonb,
	"quote_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	CONSTRAINT "bookings_owner_request_unique" UNIQUE("owner_id","client_request_id"),
	CONSTRAINT "bookings_version_positive" CHECK ("bookings"."version" > 0),
	CONSTRAINT "bookings_step_range" CHECK ("bookings"."wizard_step" BETWEEN 1 AND 3),
	CONSTRAINT "bookings_positive_range" CHECK ("bookings"."starts_at" IS NULL OR "bookings"."ends_at" IS NULL OR "bookings"."ends_at" > "bookings"."starts_at"),
	CONSTRAINT "bookings_confirmed_complete" CHECK ("bookings"."status" NOT IN ('confirmed','completed') OR (
    "bookings"."room_id" IS NOT NULL AND "bookings"."starts_at" IS NOT NULL AND "bookings"."ends_at" IS NOT NULL
    AND "bookings"."quote_snapshot" IS NOT NULL AND "bookings"."service_codes" IS NOT NULL AND "bookings"."confirmed_at" IS NOT NULL
    AND coalesce(length(btrim("bookings"."customer"->>'fullName')) > 0, false)
    AND coalesce(length(btrim("bookings"."customer"->>'email')) > 0, false))),
	CONSTRAINT "bookings_cancelled_reason" CHECK ("bookings"."status" <> 'cancelled' OR ("bookings"."cancelled_at" IS NOT NULL AND coalesce(length(btrim("bookings"."cancellation_reason")) > 0, false)))
);
--> statement-breakpoint
CREATE TABLE "captured_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedup_key" text NOT NULL,
	"booking_id" uuid NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"text_body" text NOT NULL,
	"html_body" text,
	"captured_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "captured_emails_dedup_key_unique" UNIQUE("dedup_key"),
	CONSTRAINT "captured_emails_booking_id_unique" UNIQUE("booking_id")
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"client_request_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"slots" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"draft_booking_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversations_draft_booking_id_unique" UNIQUE("draft_booking_id"),
	CONSTRAINT "chat_owner_request_unique" UNIQUE("owner_id","client_request_id"),
	CONSTRAINT "chat_version_positive" CHECK ("chat_conversations"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"client_message_id" uuid,
	"role" "message_role" NOT NULL,
	"content" text NOT NULL,
	"card_data" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"booking_id" uuid NOT NULL,
	"dedup_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "email_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "email_outbox_booking_id_unique" UNIQUE("booking_id"),
	CONSTRAINT "email_outbox_dedup_key_unique" UNIQUE("dedup_key"),
	CONSTRAINT "email_attempts_range" CHECK ("email_outbox"."attempts" BETWEEN 0 AND 6)
);
--> statement-breakpoint
CREATE TABLE "rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"size" "room_size" NOT NULL,
	"capacity" integer NOT NULL,
	"hourly_rate_cop" integer NOT NULL,
	CONSTRAINT "rooms_size_unique" UNIQUE("size"),
	CONSTRAINT "rooms_capacity_positive" CHECK ("rooms"."capacity" > 0),
	CONSTRAINT "rooms_rate_positive" CHECK ("rooms"."hourly_rate_cop" > 0)
);
--> statement-breakpoint
CREATE TABLE "services" (
	"code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"flat_price_cop" integer NOT NULL,
	CONSTRAINT "services_code_known" CHECK ("services"."code" IN ('projector','coffee')),
	CONSTRAINT "services_price_nonnegative" CHECK ("services"."flat_price_cop" >= 0)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"role" "user_role" NOT NULL,
	"full_name" text NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_email_normalized" CHECK ("users"."email" = lower(btrim("users"."email")))
);
--> statement-breakpoint
ALTER TABLE "booking_lines" ADD CONSTRAINT "booking_lines_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_room_id_rooms_id_fk" FOREIGN KEY ("room_id") REFERENCES "public"."rooms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "captured_emails" ADD CONSTRAINT "captured_emails_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_draft_booking_id_bookings_id_fk" FOREIGN KEY ("draft_booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bookings_owner_status_idx" ON "bookings" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "bookings_room_status_idx" ON "bookings" USING btree ("room_id","status");--> statement-breakpoint
CREATE INDEX "bookings_admin_order_idx" ON "bookings" USING btree ("created_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_client_message_unique" ON "chat_messages" USING btree ("conversation_id","client_message_id") WHERE "chat_messages"."role" = 'user';--> statement-breakpoint
CREATE INDEX "chat_message_order_idx" ON "chat_messages" USING btree ("conversation_id","created_at","id");--> statement-breakpoint
CREATE INDEX "email_outbox_due_idx" ON "email_outbox" USING btree ("next_attempt_at") WHERE "email_outbox"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "sessions_expires_idx" ON "sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");