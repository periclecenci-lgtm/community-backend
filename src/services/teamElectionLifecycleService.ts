import type {
  TeamElectionStatus,
  User,
} from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { prisma } from "../shared/prisma.js";

type ElectionActor = Pick<
  User,
  "id" | "username"
>;

type AllowedElectionTransition =
  | "NOMINATIONS_OPEN"
  | "VOTING_OPEN"
  | "CLOSED"
  | "CANCELLED";

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

function isValidTransition(
  currentStatus: TeamElectionStatus,
  nextStatus: AllowedElectionTransition
) {
  if (nextStatus === "CANCELLED") {
    return (
      currentStatus !== "COMPLETED" &&
      currentStatus !== "CANCELLED"
    );
  }

  if (
    currentStatus === "DRAFT" &&
    nextStatus === "NOMINATIONS_OPEN"
  ) {
    return true;
  }

  if (
    currentStatus === "NOMINATIONS_OPEN" &&
    nextStatus === "VOTING_OPEN"
  ) {
    return true;
  }

  if (
    currentStatus === "VOTING_OPEN" &&
    nextStatus === "CLOSED"
  ) {
    return true;
  }

  return false;
}

export async function changeTeamElectionPhase(
  input: {
    electionId: string;
    nextStatus: AllowedElectionTransition;
    reason: string;
    actor: ElectionActor;
  }
) {
  const currentDate = new Date();

  return prisma.$transaction(
    async (transaction) => {
      const election =
        await transaction.teamElection.findUnique({
          where: {
            id: input.electionId,
          },
          select: {
            id: true,
            type: true,
            status: true,
            seatCount: true,
            opensAt: true,
            closesAt: true,

            _count: {
              select: {
                candidates: {
                  where: {
                    status: "ELIGIBLE",
                  },
                },
                votes: true,
              },
            },
          },
        });

      if (!election) {
        throw createHttpError(
          "ELECTION_NOT_FOUND",
          404
        );
      }

      if (
        !isValidTransition(
          election.status,
          input.nextStatus
        )
      ) {
        throw createHttpError(
          "INVALID_ELECTION_STATUS_TRANSITION",
          409
        );
      }

      if (
        input.nextStatus ===
          "VOTING_OPEN" &&
        election._count.candidates === 0
      ) {
        throw createHttpError(
          "ELECTION_HAS_NO_ELIGIBLE_CANDIDATES",
          409
        );
      }

      if (
        input.nextStatus ===
          "VOTING_OPEN" &&
        currentDate.getTime() <
          election.opensAt.getTime()
      ) {
        throw createHttpError(
          "ELECTION_VOTING_PERIOD_NOT_STARTED",
          409
        );
      }

      if (
        input.nextStatus === "CLOSED" &&
        currentDate.getTime() <
          election.closesAt.getTime()
      ) {
        throw createHttpError(
          "ELECTION_VOTING_PERIOD_NOT_ENDED",
          409
        );
      }

      const updatedElection =
        await transaction.teamElection.update({
          where: {
            id: election.id,
          },
          data: {
            status: input.nextStatus,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "TEAM_ELECTION_PHASE_CHANGED",
          entityType:
            "TEAM_ELECTION",
          entityId:
            election.id,
          reason: input.reason,
          outcome:
            input.nextStatus,
          metadata: {
            electionType:
              election.type,
            previousStatus:
              election.status,
            nextStatus:
              input.nextStatus,
            eligibleCandidates:
              election._count.candidates,
            votes:
              election._count.votes,
            seats:
              election.seatCount,
          },
        },
        transaction
      );

      return updatedElection;
    }
  );
}