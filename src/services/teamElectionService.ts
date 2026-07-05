import type {
  TeamElectionType,
  User,
} from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ElectionActor = Pick<
  User,
  "id" | "username"
>;

const MAXIMUM_PERCENT_BPS = 2000;

const BOOTSTRAP_MINIMUMS = {
  USER_MANAGEMENT: 5,
  DAO_COUNCIL: 3,
} satisfies Record<TeamElectionType, number>;

function createHttpError(
  message: string,
  statusCode: number
) {
  const error = new Error(message) as Error & {
    statusCode: number;
  };

  error.statusCode = statusCode;
  return error;
}

export function calculateElectionSeatCount(
  type: TeamElectionType,
  electorateCount: number
) {
  if (electorateCount <= 0) {
    return 0;
  }

  const bootstrapMinimum =
    BOOTSTRAP_MINIMUMS[type];

  const percentageSeats = Math.floor(
    (electorateCount *
      MAXIMUM_PERCENT_BPS) /
      10_000
  );

  return Math.min(
    electorateCount,
    Math.max(
      bootstrapMinimum,
      percentageSeats
    )
  );
}

async function getCurrentCommanderIds() {
  const statuses =
    await prisma.commanderStatus.findMany({
      where: {
        user: {
          status: "ACTIVE",
        },
      },
      orderBy: {
        lastCheckedAt: "desc",
      },
      select: {
        userId: true,
        isCommander: true,
      },
    });

  const latestStatusByUser =
    new Map<string, boolean>();

  for (const status of statuses) {
    if (
      !latestStatusByUser.has(
        status.userId
      )
    ) {
      latestStatusByUser.set(
        status.userId,
        status.isCommander
      );
    }
  }

  return Array.from(
    latestStatusByUser.entries()
  )
    .filter(
      ([, isCommander]) =>
        isCommander
    )
    .map(([userId]) => userId);
}

async function getActiveUserManagementIds() {
  const currentDate = new Date();
  const commanderIds =
    await getCurrentCommanderIds();

  if (commanderIds.length === 0) {
    return [];
  }

  const memberships =
    await prisma.communityTeamMembership.findMany({
      where: {
        userId: {
          in: commanderIds,
        },
        team: "USER_MANAGEMENT",
        endedAt: null,

        AND: [
          {
            OR: [
              {
                termStartsAt: null,
              },
              {
                termStartsAt: {
                  lte: currentDate,
                },
              },
            ],
          },
          {
            OR: [
              {
                termEndsAt: null,
              },
              {
                termEndsAt: {
                  gt: currentDate,
                },
              },
            ],
          },
        ],
      },
      select: {
        userId: true,
      },
    });

  return memberships.map(
    (membership) =>
      membership.userId
  );
}

export async function getEligibleElectionVoterIds(
  type: TeamElectionType
) {
  if (type === "USER_MANAGEMENT") {
    return getCurrentCommanderIds();
  }

  return getActiveUserManagementIds();
}

export async function getEligibleCandidateIds(
  type: TeamElectionType
) {
  if (type === "USER_MANAGEMENT") {
    return getCurrentCommanderIds();
  }

  return getActiveUserManagementIds();
}

export async function getTeamElectionDashboard() {
  const elections =
    await prisma.teamElection.findMany({
      orderBy: {
        createdAt: "desc",
      },
      take: 100,

      select: {
        id: true,
        type: true,
        status: true,
        title: true,
        description: true,
        electorateCount: true,
        seatCount: true,
        maximumPercentBps: true,
        bootstrapMinimum: true,
        snapshotAt: true,
        opensAt: true,
        closesAt: true,
        termStartsAt: true,
        termEndsAt: true,
        completedAt: true,
        createdAt: true,

        createdBy: {
          select: {
            id: true,
            username: true,
          },
        },

        _count: {
          select: {
            candidates: true,
            votes: true,
            memberships: true,
          },
        },
      },
    });

  const activeElections =
    elections.filter(
      (election) =>
        election.status !==
          "COMPLETED" &&
        election.status !==
          "CANCELLED"
    );

  return {
    total: elections.length,
    active: activeElections.length,
    elections,
  };
}

export async function createTeamElection(
  input: {
    type: TeamElectionType;
    title: string;
    description: string;
    opensAt: Date;
    closesAt: Date;
    termStartsAt: Date;
    termEndsAt: Date;
    actor: ElectionActor;
  }
) {
  const currentDate = new Date();

  if (
    input.closesAt.getTime() <=
    input.opensAt.getTime()
  ) {
    throw createHttpError(
      "ELECTION_CLOSE_MUST_FOLLOW_OPEN",
      400
    );
  }

  if (
    input.termStartsAt.getTime() <
    input.closesAt.getTime()
  ) {
    throw createHttpError(
      "TERM_CANNOT_START_BEFORE_ELECTION_CLOSE",
      400
    );
  }

  if (
    input.termEndsAt.getTime() <=
    input.termStartsAt.getTime()
  ) {
    throw createHttpError(
      "TERM_END_MUST_FOLLOW_TERM_START",
      400
    );
  }

  const existingElection =
    await prisma.teamElection.findFirst({
      where: {
        type: input.type,
        status: {
          in: [
            "DRAFT",
            "NOMINATIONS_OPEN",
            "VOTING_OPEN",
            "CLOSED",
          ],
        },
      },
      select: {
        id: true,
      },
    });

  if (existingElection) {
    throw createHttpError(
      "ACTIVE_ELECTION_ALREADY_EXISTS",
      409
    );
  }

  const electorateIds =
    await getEligibleElectionVoterIds(
      input.type
    );

  const electorateCount =
    electorateIds.length;

  const seatCount =
    calculateElectionSeatCount(
      input.type,
      electorateCount
    );

  if (seatCount === 0) {
    throw createHttpError(
      "ELECTION_HAS_NO_ELIGIBLE_VOTERS",
      409
    );
  }

  const bootstrapMinimum =
    BOOTSTRAP_MINIMUMS[input.type];

  return prisma.$transaction(
    async (transaction) => {
      const election =
        await transaction.teamElection.create({
          data: {
            type: input.type,
            status: "DRAFT",
            title: input.title,
            description:
              input.description,
            createdById:
              input.actor.id,
            electorateCount,
            seatCount,
            maximumPercentBps:
              MAXIMUM_PERCENT_BPS,
            bootstrapMinimum,
            snapshotAt:
              currentDate,
            opensAt: input.opensAt,
            closesAt:
              input.closesAt,
            termStartsAt:
              input.termStartsAt,
            termEndsAt:
              input.termEndsAt,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "TEAM_ELECTION_CREATED",
          entityType:
            "TEAM_ELECTION",
          entityId: election.id,
          reason:
            input.description,
          outcome: "DRAFT",
          metadata: {
            electionType:
              input.type,
            electorateCount,
            seatCount,
            maximumPercentBps:
              MAXIMUM_PERCENT_BPS,
            bootstrapMinimum,
          },
        },
        transaction
      );

      return election;
    }
  );
}