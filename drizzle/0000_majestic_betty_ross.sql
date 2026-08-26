CREATE TABLE `ai_generations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`user_message_id` text NOT NULL,
	`provider` text NOT NULL,
	`model` text NOT NULL,
	`prompt` text NOT NULL,
	`result` text,
	`sources_json` text DEFAULT '[]' NOT NULL,
	`input_tokens` integer,
	`output_tokens` integer,
	`estimated_cost_cents` integer,
	`status` text NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`conversation_id`) REFERENCES `conversations`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `generations_tenant_id_unique` ON `ai_generations` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_generations_tenant_created` ON `ai_generations` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_generations_tenant_conversation` ON `ai_generations` (`tenant_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `appointments` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`conversation_id` text,
	`catalog_item_id` text,
	`service_name` text NOT NULL,
	`starts_at` text NOT NULL,
	`ends_at` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`,`contact_id`) REFERENCES `contacts`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`conversation_id`) REFERENCES `conversations`(`tenant_id`,`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`tenant_id`,`catalog_item_id`) REFERENCES `catalog_items`(`tenant_id`,`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE UNIQUE INDEX `appointments_tenant_id_unique` ON `appointments` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_appointments_tenant_start` ON `appointments` (`tenant_id`,`starts_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_tenant_created` ON `audit_logs` (`tenant_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `catalog_items` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`name` text NOT NULL,
	`kind` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`description` text NOT NULL,
	`price_cents` integer DEFAULT 0 NOT NULL,
	`currency` text DEFAULT 'COP' NOT NULL,
	`duration_minutes` integer DEFAULT 0 NOT NULL,
	`bookable` integer DEFAULT false NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`keywords` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `catalog_tenant_id_unique` ON `catalog_items` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_catalog_tenant_active` ON `catalog_items` (`tenant_id`,`active`,`name`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`whatsapp_id` text,
	`name` text NOT NULL,
	`phone` text NOT NULL,
	`email` text,
	`pipeline_stage` text DEFAULT 'new' NOT NULL,
	`tags_json` text DEFAULT '[]' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`last_contact_at` text NOT NULL,
	`next_follow_up_at` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_tenant_phone_unique` ON `contacts` (`tenant_id`,`phone`);--> statement-breakpoint
CREATE UNIQUE INDEX `contacts_tenant_id_unique` ON `contacts` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_contacts_tenant_last_contact` ON `contacts` (`tenant_id`,`last_contact_at`);--> statement-breakpoint
CREATE TABLE `conversations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`contact_id` text NOT NULL,
	`channel` text DEFAULT 'demo' NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`mode` text DEFAULT 'ai' NOT NULL,
	`assigned_user_id` text,
	`last_message_at` text NOT NULL,
	`unread_count` integer DEFAULT 0 NOT NULL,
	`summary` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`assigned_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`tenant_id`,`contact_id`) REFERENCES `contacts`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `conversations_tenant_id_unique` ON `conversations` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_conversations_tenant_last_message` ON `conversations` (`tenant_id`,`last_message_at`);--> statement-breakpoint
CREATE TABLE `knowledge_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`title` text NOT NULL,
	`content` text NOT NULL,
	`source_type` text NOT NULL,
	`file_name` text,
	`object_key` text,
	`status` text DEFAULT 'ready' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_tenant_id_unique` ON `knowledge_sources` (`tenant_id`,`id`);--> statement-breakpoint
CREATE INDEX `idx_knowledge_tenant_updated` ON `knowledge_sources` (`tenant_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `messages` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`conversation_id` text NOT NULL,
	`direction` text NOT NULL,
	`sender_type` text NOT NULL,
	`body` text NOT NULL,
	`status` text DEFAULT 'received' NOT NULL,
	`external_id` text,
	`ai_provider` text,
	`ai_model` text,
	`input_tokens` integer,
	`output_tokens` integer,
	`generation_id` text,
	`rag_sources_json` text DEFAULT '[]' NOT NULL,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`conversation_id`) REFERENCES `conversations`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `messages_tenant_id_unique` ON `messages` (`tenant_id`,`id`);--> statement-breakpoint
CREATE UNIQUE INDEX `messages_tenant_external_unique` ON `messages` (`tenant_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_messages_tenant_conversation_created` ON `messages` (`tenant_id`,`conversation_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `tenant_memberships` (
	`tenant_id` text NOT NULL,
	`user_id` text NOT NULL,
	`role` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY(`tenant_id`, `user_id`),
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_memberships_user` ON `tenant_memberships` (`user_id`,`tenant_id`);--> statement-breakpoint
CREATE TABLE `tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`industry` text DEFAULT '' NOT NULL,
	`timezone` text DEFAULT 'America/Bogota' NOT NULL,
	`assistant_name` text DEFAULT 'Savia' NOT NULL,
	`assistant_tone` text DEFAULT 'cálido, claro y profesional' NOT NULL,
	`assistant_prompt` text DEFAULT '' NOT NULL,
	`business_hours_json` text DEFAULT '{}' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenants_slug_unique` ON `tenants` (`slug`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);