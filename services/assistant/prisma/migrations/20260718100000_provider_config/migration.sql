-- AssistantKey becomes ProviderConfig: the row now describes which model
-- endpoint the agent talks to, not just an Anthropic key. Rename (preserving
-- data + constraint names Prisma expects), relax key columns to nullable for
-- keyless local endpoints, and add the endpoint/model overrides.
ALTER TABLE "AssistantKey" RENAME TO "ProviderConfig";
ALTER TABLE "ProviderConfig" RENAME CONSTRAINT "AssistantKey_pkey" TO "ProviderConfig_pkey";
ALTER INDEX "AssistantKey_userId_key" RENAME TO "ProviderConfig_userId_key";

ALTER TABLE "ProviderConfig" ALTER COLUMN "ciphertext" DROP NOT NULL;
ALTER TABLE "ProviderConfig" ALTER COLUMN "hint" DROP NOT NULL;
ALTER TABLE "ProviderConfig" ADD COLUMN "baseUrl" TEXT;
ALTER TABLE "ProviderConfig" ADD COLUMN "model" TEXT;
