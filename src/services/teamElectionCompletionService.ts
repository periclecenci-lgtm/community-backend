import type { User } from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import { getEligibleCandidateIds } from "./teamElectionService.js";
import { prisma } from "../shared/prisma.js";

type ElectionActor = Pick<
  User,
  "id" | "username"
>;

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

export async function completeTeamElectionRound(
  input: {
    electionId: string;
    runoffOpensAt?: Date;
    runoffClosesAt?: Date;
    actor: ElectionActor;
  }
) {
  const election =
    await prisma.teamElection.findUnique({
      where: {
        id: input.electionId,
      },
      select: {
        id: true,
        type: true,
        status: true,
        seatCount: true,
        currentRound: true,
        runoffSeatCount: true,
        termStartsAt: true,
        termEndsAt: true,

        candidates: {
          where: {
            status: "ELIGIBLE",
          },
          select: {
            id: true,
            candidateId: true,
            submittedAt: true,
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

  if (election.status !== "CLOSED") {
    throw createHttpError(
      "ELECTION_MUST_BE_CLOSED",
      409
    );
  }

  if (election.candidates.length === 0) {
    throw createHttpError(
      "ELECTION_HAS_NO_ELIGIBLE_CANDIDATES",
      409
    );
  }

  const currentlyEligibleIds =
    await getEligibleCandidateIds(
      election.type
    );

  const eligibleCandidates =
    election.candidates.filter(
      (candidate) =>
        currentlyEligibleIds.includes(
          candidate.candidateId
        )
    );

  const disqualifiedCandidates =
    election.candidates.filter(
      (candidate) =>
        !currentlyEligibleIds.includes(
          candidate.candidateId
        )
    );

  if (eligibleCandidates.length === 0) {
    throw createHttpError(
      "ELECTION_HAS_NO_CURRENTLY_ELIGIBLE_CANDIDATES",
      409
    );
  }

  const voteGroups =
    await prisma.teamElectionVote.groupBy({
      by: ["candidateId"],
      where: {
        electionId: election.id,
        round: election.currentRound,
        candidateId: {
          in: eligibleCandidates.map(
            (candidate) =>
              candidate.id
          ),
        },
      },
      _count: {
        _all: true,
      },
    });

  const voteCountByCandidate =
    new Map(
      voteGroups.map((group) => [
        group.candidateId,
        group._count._all,
      ])
    );

  const ranking = eligibleCandidates
    .map((candidate) => ({
      ...candidate,
      votes:
        voteCountByCandidate.get(
          candidate.id
        ) ?? 0,
    }))
    .sort(
      (first, second) =>
        second.votes - first.votes
    );

  const seatsAvailable =
    election.runoffSeatCount ??
    election.seatCount;

  const effectiveSeats = Math.min(
    seatsAvailable,
    ranking.length
  );

  if (effectiveSeats === 0) {
    throw createHttpError(
      "ELECTION_HAS_NO_AVAILABLE_SEATS",
      409
    );
  }

  const cutoffVotes =
    ranking[effectiveSeats - 1]?.votes;

  if (cutoffVotes === undefined) {
    throw createHttpError(
      "ELECTION_RESULT_CANNOT_BE_CALCULATED",
      500
    );
  }

  const candidatesAboveCutoff =
    ranking.filter(
      (candidate) =>
        candidate.votes > cutoffVotes
    );

  const candidatesAtCutoff =
    ranking.filter(
      (candidate) =>
        candidate.votes === cutoffVotes
    );

  const candidatesBelowCutoff =
    ranking.filter(
      (candidate) =>
        candidate.votes < cutoffVotes
    );

  const remainingSeats =
    effectiveSeats -
    candidatesAboveCutoff.length;

  const requiresRunoff =
    candidatesAtCutoff.length >
    remainingSeats;

  if (requiresRunoff) {
    const runoffOpensAt =
      input.runoffOpensAt;

    const runoffClosesAt =
      input.runoffClosesAt;

    if (
      !runoffOpensAt ||
      !runoffClosesAt
    ) {
      throw createHttpError(
        "RUNOFF_DATES_REQUIRED",
        400
      );
    }

    const currentDate = new Date();

    if (
      runoffOpensAt.getTime() <=
      currentDate.getTime()
    ) {
      throw createHttpError(
        "RUNOFF_OPEN_MUST_BE_IN_FUTURE",
        400
      );
    }

    if (
      runoffClosesAt.getTime() <=
      runoffOpensAt.getTime()
    ) {
      throw createHttpError(
        "RUNOFF_CLOSE_MUST_FOLLOW_OPEN",
        400
      );
    }

    return prisma.$transaction(
      async (transaction) => {
        for (
          const candidate of
          candidatesAboveCutoff
        ) {
          await transaction.teamElectionCandidate.update({
            where: {
              id: candidate.id,
            },
            data: {
              status: "ELECTED",
              decidedAt: new Date(),
            },
          });
        }

        for (
          const candidate of
          candidatesBelowCutoff
        ) {
          await transaction.teamElectionCandidate.update({
            where: {
              id: candidate.id,
            },
            data: {
              status:
                "NOT_ELECTED",
              decidedAt: new Date(),
            },
          });
        }

        for (
          const candidate of
          disqualifiedCandidates
        ) {
          await transaction.teamElectionCandidate.update({
            where: {
              id: candidate.id,
            },
            data: {
              status: "REJECTED",
              decidedAt: new Date(),
            },
          });
        }

        const updatedElection =
          await transaction.teamElection.update({
            where: {
              id: election.id,
            },
            data: {
              status: "VOTING_OPEN",
              currentRound: {
                increment: 1,
              },
              runoffSeatCount:
                remainingSeats,
              opensAt:
                runoffOpensAt,
              closesAt:
                runoffClosesAt,
            },
          });

        await createAuditEvent(
          {
            actorId:
              input.actor.id,
            actorType: "USER",
            actorLabel:
              input.actor.username,
            action:
              "TEAM_ELECTION_RUNOFF_OPENED",
            entityType:
              "TEAM_ELECTION",
            entityId:
              election.id,
            reason:
              "Tie at the final available seat",
            outcome:
              "VOTING_OPEN",
            metadata: {
              electionType:
                election.type,
              completedRound:
                election.currentRound,
              nextRound:
                election.currentRound +
                1,
              remainingSeats,
              tiedCandidateIds:
                candidatesAtCutoff.map(
                  (candidate) =>
                    candidate.candidateId
                ),
              electedCandidateIds:
                candidatesAboveCutoff.map(
                  (candidate) =>
                    candidate.candidateId
                ),
            },
          },
          transaction
        );

        return {
          completed: false,
          runoffRequired: true,
          election:
            updatedElection,
          remainingSeats,
          tiedCandidates:
            candidatesAtCutoff,
          electedCandidates:
            candidatesAboveCutoff,
        };
      }
    );
  }

  const electedCandidates =
    ranking.slice(0, effectiveSeats);

  const nonElectedCandidates =
    ranking.slice(effectiveSeats);

  return prisma.$transaction(
    async (transaction) => {
      for (
        const candidate of
        electedCandidates
      ) {
        await transaction.teamElectionCandidate.update({
          where: {
            id: candidate.id,
          },
          data: {
            status: "ELECTED",
            decidedAt: new Date(),
          },
        });
      }

      for (
        const candidate of
        nonElectedCandidates
      ) {
        await transaction.teamElectionCandidate.update({
          where: {
            id: candidate.id,
          },
          data: {
            status: "NOT_ELECTED",
            decidedAt: new Date(),
          },
        });
      }

      for (
        const candidate of
        disqualifiedCandidates
      ) {
        await transaction.teamElectionCandidate.update({
          where: {
            id: candidate.id,
          },
          data: {
            status: "REJECTED",
            decidedAt: new Date(),
          },
        });
      }

      const allElectedCandidates =
        await transaction.teamElectionCandidate.findMany({
          where: {
            electionId:
              election.id,
            status: "ELECTED",
          },
          select: {
            candidateId: true,
          },
        });

      const membershipTeam =
        election.type ===
        "USER_MANAGEMENT"
          ? "USER_MANAGEMENT"
          : "DAO_COUNCIL";

      for (
        const candidate of
        allElectedCandidates
      ) {
        await transaction.communityTeamMembership.upsert({
          where: {
            userId_team: {
              userId:
                candidate.candidateId,
              team:
                membershipTeam,
            },
          },
          update: {
            sourceElectionId:
              election.id,
            appointedById: null,
            appointedAt:
              new Date(),
            termStartsAt:
              election.termStartsAt,
            termEndsAt:
              election.termEndsAt,
            endedAt: null,
            endReason: null,
          },
          create: {
            userId:
              candidate.candidateId,
            team:
              membershipTeam,
            sourceElectionId:
              election.id,
            appointedById: null,
            termStartsAt:
              election.termStartsAt,
            termEndsAt:
              election.termEndsAt,
          },
        });
      }

      const completedElection =
        await transaction.teamElection.update({
          where: {
            id: election.id,
          },
          data: {
            status: "COMPLETED",
            runoffSeatCount: null,
            completedAt:
              new Date(),
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "TEAM_ELECTION_COMPLETED",
          entityType:
            "TEAM_ELECTION",
          entityId:
            election.id,
          reason:
            "Election results completed",
          outcome: "COMPLETED",
          metadata: {
            electionType:
              election.type,
            finalRound:
              election.currentRound,
            electedCandidateIds:
              allElectedCandidates.map(
                (candidate) =>
                  candidate.candidateId
              ),
            disqualifiedCandidateIds:
              disqualifiedCandidates.map(
                (candidate) =>
                  candidate.candidateId
              ),
          },
        },
        transaction
      );

      return {
        completed: true,
        runoffRequired: false,
        election:
          completedElection,
        electedCandidates:
          allElectedCandidates,
      };
    }
  );
}