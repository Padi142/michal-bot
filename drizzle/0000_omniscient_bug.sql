CREATE TABLE `debtors` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`debtor_name` text NOT NULL,
	`amount_owed` integer NOT NULL,
	`payed` integer DEFAULT false NOT NULL,
	`currency` text DEFAULT 'CZK' NOT NULL,
	`reason` text DEFAULT '',
	`created` text DEFAULT (CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE `friends` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`chatId` integer NOT NULL,
	`handle` text NOT NULL,
	`approved` integer DEFAULT false NOT NULL,
	`pronouns` text,
	`added` text DEFAULT (CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE `scheduled_messages` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`chatId` integer NOT NULL,
	`message` text NOT NULL,
	`scheduledFor` text NOT NULL,
	`sent` integer DEFAULT false NOT NULL,
	`failed` integer DEFAULT false NOT NULL,
	`created` text DEFAULT (CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE `todos` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`task` text NOT NULL,
	`category` text DEFAULT 'general',
	`completed` integer DEFAULT false NOT NULL,
	`created` text DEFAULT (CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE `video_ideas` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`idea` text NOT NULL,
	`filmed` integer DEFAULT false NOT NULL,
	`created` text DEFAULT (CURRENT_DATE)
);
--> statement-breakpoint
CREATE TABLE `what_friends_want_from_me` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`friendId` integer NOT NULL,
	`request` text NOT NULL,
	`fulfilled` integer DEFAULT false NOT NULL,
	`created` text DEFAULT (CURRENT_DATE)
);
