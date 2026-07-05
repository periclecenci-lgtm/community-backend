/// <reference types="node" />

import "dotenv/config";
import process from "node:process";

import { prisma } from "../src/shared/prisma.js";

const boards = [
  {
    slug: "market-news",
    title: "Market & News",
    description:
      "Crypto analysis, news and major events.",
  },
  {
    slug: "projects-proposals",
    title: "Projects & Proposals",
    description:
      "Project ideas, proposals and discussions within the SBELM community.",
  },
];

async function seedBoards() {
  for (const board of boards) {
    await prisma.board.upsert({
      where: {
        slug: board.slug,
      },
      update: {
        title: board.title,
        description:
          board.description,
      },
      create: board,
    });
  }

  console.log(
    "Community boards seeded"
  );
}

async function seedDevelopmentFounder() {
  const founderEmail =
    process.env.DEVELOPMENT_FOUNDER_EMAIL
      ?.trim()
      .toLowerCase();

  if (!founderEmail) {
    console.warn(
      "DEVELOPMENT_FOUNDER_EMAIL is not configured. Development founder bootstrap skipped."
    );

    return;
  }

  const founder =
    await prisma.user.findUnique({
      where: {
        email: founderEmail,
      },
      select: {
        id: true,
        email: true,
        username: true,
      },
    });

  if (!founder) {
    console.warn(
      `Development founder account not found for ${founderEmail}. Create the account and run the seed again.`
    );

    return;
  }

  const existingMembership =
    await prisma.communityTeamMembership.findUnique({
      where: {
        userId_team: {
          userId: founder.id,
          team: "DEVELOPMENT",
        },
      },
    });

  if (
    existingMembership &&
    !existingMembership.endedAt &&
    !existingMembership.termEndsAt
  ) {
    console.log(
      `Development founder already configured: ${founder.username}`
    );

    return;
  }

  const membership =
    await prisma.$transaction(
      async (transaction) => {
        const developmentMembership =
          await transaction.communityTeamMembership.upsert({
            where: {
              userId_team: {
                userId:
                  founder.id,
                team: "DEVELOPMENT",
              },
            },
            update: {
              appointedById: null,
              sourceElectionId: null,
              appointedAt:
                new Date(),
              termStartsAt: null,
              termEndsAt: null,
              endedAt: null,
              endReason: null,
            },
            create: {
              userId: founder.id,
              team: "DEVELOPMENT",
              appointedById: null,
              sourceElectionId: null,
              termStartsAt: null,
              termEndsAt: null,
            },
          });

        await transaction.auditEvent.create({
          data: {
            actorId: null,
            actorType: "SYSTEM",
            actorLabel:
              "SYSTEM_BOOTSTRAP",
            action:
              "DEVELOPMENT_FOUNDER_BOOTSTRAPPED",
            entityType:
              "TEAM_MEMBERSHIP",
            entityId:
              developmentMembership.id,
            reason:
              "Founding developer configured from DEVELOPMENT_FOUNDER_EMAIL",
            outcome: "ACTIVE",
            metadata: {
              userId: founder.id,
              username:
                founder.username,
              email: founder.email,
              team: "DEVELOPMENT",
              foundingMember: true,
            },
          },
        });

        return developmentMembership;
      }
    );

  console.log(
    `Development founder configured: ${founder.username} (${membership.id})`
  );
}

async function main() {
  await seedBoards();
  await seedDevelopmentFounder();
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });