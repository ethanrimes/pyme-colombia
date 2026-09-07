CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`actor` text NOT NULL,
	`action` text NOT NULL,
	`reference` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_org_date` ON `audit` (`org`,`created_at`);--> statement-breakpoint
CREATE TABLE `bank_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`external_id` text NOT NULL,
	`date` text NOT NULL,
	`description` text NOT NULL,
	`amount` integer NOT NULL,
	`payment_id` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_org_external` ON `bank_entries` (`org`,`external_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `bank_payment` ON `bank_entries` (`payment_id`);--> statement-breakpoint
CREATE TABLE `contacts` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`name` text NOT NULL,
	`document` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`kind` text NOT NULL,
	`city` text DEFAULT 'Bogotá' NOT NULL,
	FOREIGN KEY (`org`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `contacts_org` ON `contacts` (`org`);--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`provider` text NOT NULL,
	`external_id` text NOT NULL,
	`status` text NOT NULL,
	`message` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `events_org_provider_external` ON `events` (`org`,`provider`,`external_id`);--> statement-breakpoint
CREATE TABLE `expenses` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`description` text NOT NULL,
	`category` text NOT NULL,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`created_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	CONSTRAINT "expense_positive" CHECK("expenses"."amount">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `expenses_org_key` ON `expenses` (`org`,`idempotency_key`);--> statement-breakpoint
CREATE TABLE `integrations` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`provider` text NOT NULL,
	`config` text NOT NULL,
	`updated_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `integrations_org_provider` ON `integrations` (`org`,`provider`);--> statement-breakpoint
CREATE TABLE `locations` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`name` text NOT NULL,
	FOREIGN KEY (`org`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `locations_org_name` ON `locations` (`org`,`name`);--> statement-breakpoint
CREATE TABLE `movements` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`kind` text NOT NULL,
	`reference` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `movements_org_date` ON `movements` (`org`,`created_at`);--> statement-breakpoint
CREATE INDEX `movements_product_date` ON `movements` (`org`,`product_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `organizations` (
	`id` text PRIMARY KEY NOT NULL,
	`owner` text NOT NULL,
	`name` text NOT NULL,
	`nit` text DEFAULT '' NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`address` text DEFAULT '' NOT NULL,
	`city` text DEFAULT 'Bogotá' NOT NULL,
	`demo` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `payments` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`sale_id` text,
	`purchase_id` text,
	`amount` integer NOT NULL,
	`method` text NOT NULL,
	`reference` text NOT NULL,
	`created_at` text NOT NULL,
	`idempotency_key` text NOT NULL,
	CONSTRAINT "payment_positive" CHECK("payments"."amount">0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `payments_org_key` ON `payments` (`org`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `payments_org_date` ON `payments` (`org`,`created_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`sku` text NOT NULL,
	`barcode` text DEFAULT '' NOT NULL,
	`name` text NOT NULL,
	`category` text NOT NULL,
	`unit` text DEFAULT 'und' NOT NULL,
	`cost` integer NOT NULL,
	`price` integer NOT NULL,
	`wholesale_price` integer NOT NULL,
	`wholesale_min` integer DEFAULT 6 NOT NULL,
	`tax_rate` integer DEFAULT 19 NOT NULL,
	`min_stock` integer DEFAULT 10 NOT NULL,
	`active` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`org`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "product_money" CHECK("products"."cost">=0 AND "products"."price">=0 AND "products"."wholesale_price">=0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_org_sku` ON `products` (`org`,`sku`);--> statement-breakpoint
CREATE TABLE `purchase_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`purchase_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	FOREIGN KEY (`purchase_id`) REFERENCES `purchases`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "purchase_quantity_positive" CHECK("purchase_items"."quantity">0 AND "purchase_items"."unit_cost">=0)
);
--> statement-breakpoint
CREATE INDEX `purchase_items_purchase` ON `purchase_items` (`purchase_id`);--> statement-breakpoint
CREATE TABLE `purchases` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`number` text NOT NULL,
	`supplier_id` text NOT NULL,
	`location_id` text NOT NULL,
	`status` text NOT NULL,
	`total` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`due_date` text,
	`received_at` text,
	`idempotency_key` text NOT NULL,
	CONSTRAINT "purchase_paid_valid" CHECK("purchases"."paid">=0 AND "purchases"."paid"<="purchases"."total")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `purchases_org_key` ON `purchases` (`org`,`idempotency_key`);--> statement-breakpoint
CREATE INDEX `purchases_org_date` ON `purchases` (`org`,`created_at`);--> statement-breakpoint
CREATE TABLE `sale_items` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`sale_id` text NOT NULL,
	`product_id` text NOT NULL,
	`name` text NOT NULL,
	`sku` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price` integer NOT NULL,
	`unit_cost` integer NOT NULL,
	`tax_rate` integer NOT NULL,
	`subtotal` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	FOREIGN KEY (`sale_id`) REFERENCES `sales`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sale_quantity_positive" CHECK("sale_items"."quantity">0)
);
--> statement-breakpoint
CREATE INDEX `sale_items_sale` ON `sale_items` (`sale_id`);--> statement-breakpoint
CREATE TABLE `sales` (
	`id` text PRIMARY KEY NOT NULL,
	`org` text NOT NULL,
	`number` text NOT NULL,
	`location_id` text NOT NULL,
	`customer_id` text,
	`channel` text NOT NULL,
	`status` text NOT NULL,
	`payment_method` text NOT NULL,
	`subtotal` integer NOT NULL,
	`tax` integer NOT NULL,
	`total` integer NOT NULL,
	`cost` integer NOT NULL,
	`paid` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL,
	`due_date` text,
	`idempotency_key` text NOT NULL,
	`external_id` text,
	`invoice_status` text DEFAULT 'not_issued' NOT NULL,
	`invoice_reference` text,
	`note` text DEFAULT '' NOT NULL,
	FOREIGN KEY (`org`) REFERENCES `organizations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "sales_paid_valid" CHECK("sales"."paid">=0 AND "sales"."paid"<="sales"."total")
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sales_org_idempotency` ON `sales` (`org`,`idempotency_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `sales_org_number` ON `sales` (`org`,`number`);--> statement-breakpoint
CREATE INDEX `sales_org_date` ON `sales` (`org`,`created_at`);--> statement-breakpoint
CREATE TABLE `stock` (
	`org` text NOT NULL,
	`product_id` text NOT NULL,
	`location_id` text NOT NULL,
	`quantity` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`product_id`, `location_id`),
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`location_id`) REFERENCES `locations`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "stock_nonnegative" CHECK("stock"."quantity">=0)
);
--> statement-breakpoint
CREATE INDEX `stock_org` ON `stock` (`org`);