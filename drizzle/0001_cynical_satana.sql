CREATE TABLE `ai_provider_connections` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`provider` text NOT NULL,
	`purpose` text NOT NULL,
	`base_url` text,
	`encrypted_api_key` text,
	`key_hint` text,
	`status` text DEFAULT 'active' NOT NULL,
	`last_tested_at` text,
	`last_test_status` text,
	`last_test_message` text,
	`created_by` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE restrict
);
--> statement-breakpoint
CREATE INDEX `idx_ai_connections_provider` ON `ai_provider_connections` (`provider`,`status`);--> statement-breakpoint
CREATE TABLE `auth_accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`issuer` text NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` text,
	`refreshTokenExpiresAt` text,
	`scope` text,
	`password` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_accounts_issuer_account_unique` ON `auth_accounts` (`issuer`,`accountId`);--> statement-breakpoint
CREATE INDEX `idx_auth_accounts_user` ON `auth_accounts` (`userId`);--> statement-breakpoint
CREATE TABLE `auth_sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` text NOT NULL,
	`token` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_sessions_token_unique` ON `auth_sessions` (`token`);--> statement-breakpoint
CREATE INDEX `idx_auth_sessions_user` ON `auth_sessions` (`userId`);--> statement-breakpoint
CREATE TABLE `auth_two_factor` (
	`id` text PRIMARY KEY NOT NULL,
	`secret` text NOT NULL,
	`backupCodes` text NOT NULL,
	`userId` text NOT NULL,
	`verified` integer DEFAULT true NOT NULL,
	`failedVerificationCount` integer DEFAULT 0 NOT NULL,
	`lockedUntil` text,
	FOREIGN KEY (`userId`) REFERENCES `auth_users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_auth_two_factor_secret` ON `auth_two_factor` (`secret`);--> statement-breakpoint
CREATE INDEX `idx_auth_two_factor_user` ON `auth_two_factor` (`userId`);--> statement-breakpoint
CREATE TABLE `auth_users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL,
	`twoFactorEnabled` integer DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_users_email_unique` ON `auth_users` (`email`);--> statement-breakpoint
CREATE TABLE `auth_verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` text NOT NULL,
	`createdAt` text NOT NULL,
	`updatedAt` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_verifications_identifier` ON `auth_verifications` (`identifier`);--> statement-breakpoint
CREATE TABLE `embedding_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`source_id` text,
	`reason` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`total_chunks` integer DEFAULT 0 NOT NULL,
	`processed_chunks` integer DEFAULT 0 NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_embedding_jobs_tenant_status` ON `embedding_jobs` (`tenant_id`,`status`,`created_at`);--> statement-breakpoint
CREATE TABLE `knowledge_chunks` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text NOT NULL,
	`source_id` text NOT NULL,
	`chunk_index` integer NOT NULL,
	`content` text NOT NULL,
	`token_estimate` integer DEFAULT 0 NOT NULL,
	`embedding_json` text,
	`embedding_provider` text,
	`embedding_model` text,
	`embedding_dimensions` integer,
	`embedding_version` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`error` text,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`tenant_id`,`source_id`) REFERENCES `knowledge_sources`(`tenant_id`,`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `knowledge_chunks_tenant_source_index_unique` ON `knowledge_chunks` (`tenant_id`,`source_id`,`chunk_index`);--> statement-breakpoint
CREATE INDEX `idx_chunks_tenant_source` ON `knowledge_chunks` (`tenant_id`,`source_id`,`status`);--> statement-breakpoint
CREATE TABLE `platform_audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text,
	`detail` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_platform_audit_created` ON `platform_audit_logs` (`created_at`);--> statement-breakpoint
CREATE TABLE `platform_roles` (
	`user_id` text PRIMARY KEY NOT NULL,
	`role` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_platform_roles_status` ON `platform_roles` (`status`,`role`);--> statement-breakpoint
CREATE TABLE `rateLimit` (
	`id` text PRIMARY KEY NOT NULL,
	`key` text NOT NULL,
	`count` integer NOT NULL,
	`lastRequest` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rateLimit_key_unique` ON `rateLimit` (`key`);--> statement-breakpoint
CREATE TABLE `tenant_ai_settings` (
	`tenant_id` text PRIMARY KEY NOT NULL,
	`llm_connection_id` text,
	`llm_model` text,
	`llm_temperature_milli` integer DEFAULT 200 NOT NULL,
	`llm_max_tokens` integer DEFAULT 420 NOT NULL,
	`llm_fallback_connection_id` text,
	`llm_fallback_model` text,
	`embedding_connection_id` text,
	`embedding_model` text,
	`embedding_dimensions` integer,
	`retrieval_mode` text DEFAULT 'hybrid' NOT NULL,
	`config_version` integer DEFAULT 1 NOT NULL,
	`updated_by` text,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`llm_connection_id`) REFERENCES `ai_provider_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`llm_fallback_connection_id`) REFERENCES `ai_provider_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`embedding_connection_id`) REFERENCES `ai_provider_connections`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updated_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `tenant_invitations` (
	`id` text PRIMARY KEY NOT NULL,
	`tenant_id` text,
	`email` text NOT NULL,
	`name` text NOT NULL,
	`tenant_role` text,
	`platform_role` text,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`accepted_at` text,
	`revoked_at` text,
	`invited_by` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`invited_by`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `tenant_invitations_token_hash_unique` ON `tenant_invitations` (`token_hash`);--> statement-breakpoint
CREATE INDEX `idx_invitations_tenant_email` ON `tenant_invitations` (`tenant_id`,`email`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_invitations_expiry` ON `tenant_invitations` (`expires_at`,`accepted_at`,`revoked_at`);--> statement-breakpoint
ALTER TABLE `tenants` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `status` text DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE `users` ADD `updated_at` text;--> statement-breakpoint
ALTER TABLE `users` ADD `last_login_at` text;