-- Add the missing Board fields while preserving the existing table.
ALTER TABLE "Board"
ADD COLUMN "slug" TEXT,
ADD COLUMN "description" TEXT;

-- Assign valid values to existing boards before making the fields required.
WITH ranked_boards AS (
    SELECT
        "id",
        "title",
        ROW_NUMBER() OVER (
            PARTITION BY LOWER("title")
            ORDER BY "createdAt", "id"
        ) AS position
    FROM "Board"
)
UPDATE "Board" AS board
SET
    "slug" = CASE
        WHEN LOWER(ranked."title") IN (
            'market news',
            'market & news'
        )
        AND ranked.position = 1
            THEN 'market-news'

        WHEN LOWER(ranked."title") IN (
            'projects & proposals',
            'projects and proposals'
        )
        AND ranked.position = 1
            THEN 'projects-proposals'

        ELSE 'board-' || REPLACE(board."id", '-', '')
    END,

    "description" = CASE
        WHEN LOWER(ranked."title") IN (
            'market news',
            'market & news'
        )
            THEN 'Crypto analysis, news and major events.'

        WHEN LOWER(ranked."title") IN (
            'projects & proposals',
            'projects and proposals'
        )
            THEN 'Project ideas, proposals and discussions within the SBELM community.'

        ELSE 'Community discussion board.'
    END
FROM ranked_boards AS ranked
WHERE ranked."id" = board."id";

ALTER TABLE "Board"
ALTER COLUMN "slug" SET NOT NULL,
ALTER COLUMN "description" SET NOT NULL;

CREATE UNIQUE INDEX "Board_slug_key"
ON "Board"("slug");

-- Add the missing Post field.
ALTER TABLE "Post"
ADD COLUMN "isProposal" BOOLEAN NOT NULL DEFAULT false;

-- Add indexes to the existing relations.
CREATE INDEX "Post_authorId_idx"
ON "Post"("authorId");

CREATE INDEX "Post_boardId_idx"
ON "Post"("boardId");

CREATE INDEX "Comment_authorId_idx"
ON "Comment"("authorId");

CREATE INDEX "Comment_postId_idx"
ON "Comment"("postId");