CREATE TABLE "findings" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"file_path" varchar(400) NOT NULL,
	"line" integer DEFAULT 1 NOT NULL,
	"end_line" integer,
	"severity" varchar(16) DEFAULT 'minor' NOT NULL,
	"category" varchar(32) DEFAULT 'style' NOT NULL,
	"title" varchar(240) NOT NULL,
	"message" text NOT NULL,
	"suggestion" text,
	"origin" varchar(24) DEFAULT 'heuristic' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_files" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"path" varchar(400) NOT NULL,
	"language" varchar(24) DEFAULT 'plaintext' NOT NULL,
	"content" text NOT NULL,
	"line_count" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" serial PRIMARY KEY NOT NULL,
	"public_id" varchar(32) NOT NULL,
	"title" varchar(200) NOT NULL,
	"author" varchar(120) DEFAULT 'Аноним' NOT NULL,
	"cohort" varchar(120) DEFAULT '' NOT NULL,
	"language" varchar(24) DEFAULT 'mixed' NOT NULL,
	"source_kind" varchar(24) DEFAULT 'paste' NOT NULL,
	"repo_url" text,
	"status" varchar(24) DEFAULT 'queued' NOT NULL,
	"score" integer,
	"readability" integer,
	"architecture" integer,
	"complexity" varchar(48),
	"verdict" varchar(48),
	"summary" text,
	"report" jsonb,
	"engine" varchar(48) DEFAULT 'heuristic-engine' NOT NULL,
	"duration_ms" real,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	CONSTRAINT "submissions_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
ALTER TABLE "findings" ADD CONSTRAINT "findings_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_files" ADD CONSTRAINT "review_files_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "findings_submission_idx" ON "findings" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "review_files_submission_idx" ON "review_files" USING btree ("submission_id");--> statement-breakpoint
CREATE INDEX "submissions_created_at_idx" ON "submissions" USING btree ("created_at");