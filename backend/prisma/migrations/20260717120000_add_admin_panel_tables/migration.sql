CREATE TABLE "admin_audit_log" (
    "id" BIGSERIAL NOT NULL,
    "actor_id" UUID NOT NULL,
    "action" VARCHAR(50) NOT NULL,
    "target_type" VARCHAR(30) NOT NULL,
    "target_id" VARCHAR(50) NOT NULL,
    "details" JSONB,
    "env" VARCHAR(10) NOT NULL,
    "ip_address" VARCHAR(50),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_audit_log_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "runtime_settings" (
    "key" VARCHAR(100) NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by" UUID,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "runtime_settings_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "idx_admin_audit_actor" ON "admin_audit_log"("actor_id");

CREATE INDEX "idx_admin_audit_target" ON "admin_audit_log"("target_type", "target_id");

CREATE INDEX "idx_admin_audit_created" ON "admin_audit_log"("created_at");
