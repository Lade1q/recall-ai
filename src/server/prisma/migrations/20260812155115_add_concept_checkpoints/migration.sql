-- CreateTable
CREATE TABLE "concept_checkpoints" (
    "id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "text" VARCHAR(300) NOT NULL,
    "order_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "concept_checkpoints_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "concept_checkpoints_concept_id_idx" ON "concept_checkpoints"("concept_id");

-- CreateIndex
CREATE UNIQUE INDEX "concept_checkpoints_concept_id_text_key" ON "concept_checkpoints"("concept_id", "text");

-- AddForeignKey
ALTER TABLE "concept_checkpoints" ADD CONSTRAINT "concept_checkpoints_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
