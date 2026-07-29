-- CreateEnum
CREATE TYPE "DocumentKind" AS ENUM ('pdf', 'image', 'text');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "filename" VARCHAR(255) NOT NULL,
    "file_key" TEXT NOT NULL,
    "kind" "DocumentKind" NOT NULL DEFAULT 'pdf',
    "page_count" INTEGER,
    "byte_size" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "concept_sources" (
    "id" UUID NOT NULL,
    "concept_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "page_from" INTEGER,
    "page_to" INTEGER,
    "excerpt" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concept_sources_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "documents_plan_id_idx" ON "documents"("plan_id");

-- CreateIndex
CREATE INDEX "concept_sources_concept_id_idx" ON "concept_sources"("concept_id");

-- CreateIndex
CREATE INDEX "concept_sources_document_id_idx" ON "concept_sources"("document_id");

-- AddForeignKey
ALTER TABLE "documents" ADD CONSTRAINT "documents_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "study_plans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_sources" ADD CONSTRAINT "concept_sources_concept_id_fkey" FOREIGN KEY ("concept_id") REFERENCES "concepts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concept_sources" ADD CONSTRAINT "concept_sources_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
