import type { User } from "@prisma/client";

import { createAuditEvent } from "./auditService.js";
import {
  getEligibleCandidateIds,
  getEligibleElectionVoterIds,
} from "./teamElectionService.js";
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

export async function submitElectionCandidate(
  input: {
    electionId: string;
    candidateId: string;
    statement: string;
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
        currentRound: true,
      },
    });

  if (!election) {
    throw createHttpError(
      "ELECTION_NOT_FOUND",
      404
    );
  }

  if (
    election.status !==
    "NOMINATIONS_OPEN"
  ) {
    throw createHttpError(
      "ELECTION_NOMINATIONS_NOT_OPEN",
      409
    );
  }

  if (election.currentRound !== 1) {
    throw createHttpError(
      "RUNOFF_DOES_NOT_ACCEPT_NEW_CANDIDATES",
      409
    );
  }

  const eligibleCandidateIds =
    await getEligibleCandidateIds(
      election.type
    );

  if (
    !eligibleCandidateIds.includes(
      input.candidateId
    )
  ) {
    throw createHttpError(
      "CANDIDATE_NOT_ELIGIBLE",
      403
    );
  }

  if (
    election.type ===
      "USER_MANAGEMENT" &&
    input.actor.id !== input.candidateId
  ) {
    throw createHttpError(
      "USER_MANAGEMENT_REQUIRES_SELF_CANDIDACY",
      403
    );
  }

  if (
    election.type === "DAO_COUNCIL"
  ) {
    const eligibleNominatorIds =
      await getEligibleElectionVoterIds(
        "DAO_COUNCIL"
      );

    if (
      !eligibleNominatorIds.includes(
        input.actor.id
      )
    ) {
      throw createHttpError(
        "DAO_NOMINATOR_NOT_ELIGIBLE",
        403
      );
    }
  }

  const existingCandidate =
    await prisma.teamElectionCandidate.findUnique({
      where: {
        electionId_candidateId: {
          electionId:
            election.id,
          candidateId:
            input.candidateId,
        },
      },
      select: {
        id: true,
      },
    });

  if (existingCandidate) {
    throw createHttpError(
      "CANDIDACY_ALREADY_EXISTS",
      409
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const candidate =
        await transaction.teamElectionCandidate.create({
          data: {
            electionId:
              election.id,
            candidateId:
              input.candidateId,
            nominatedById:
              election.type ===
              "DAO_COUNCIL"
                ? input.actor.id
                : null,
            statement:
              input.statement,
            status: "ELIGIBLE",
            decidedAt: new Date(),
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            election.type ===
            "DAO_COUNCIL"
              ? "DAO_COUNCIL_CANDIDATE_NOMINATED"
              : "USER_MANAGEMENT_CANDIDACY_SUBMITTED",
          entityType:
            "TEAM_CANDIDACY",
          entityId:
            candidate.id,
          reason:
            input.statement,
          outcome: "ELIGIBLE",
          metadata: {
            electionId:
              election.id,
            electionType:
              election.type,
            candidateId:
              input.candidateId,
          },
        },
        transaction
      );

      return candidate;
    }
  );
}

export async function withdrawElectionCandidate(
  input: {
    electionId: string;
    candidateId: string;
    reason: string;
    actor: ElectionActor;
  }
) {
  const candidate =
    await prisma.teamElectionCandidate.findUnique({
      where: {
        electionId_candidateId: {
          electionId:
            input.electionId,
          candidateId:
            input.candidateId,
        },
      },
      include: {
        election: {
          select: {
            status: true,
            type: true,
            currentRound: true,
          },
        },
      },
    });

  if (!candidate) {
    throw createHttpError(
      "CANDIDACY_NOT_FOUND",
      404
    );
  }

  if (
    input.actor.id !==
    candidate.candidateId
  ) {
    throw createHttpError(
      "CANDIDACY_WITHDRAWAL_DENIED",
      403
    );
  }

  if (
    candidate.election.currentRound !== 1
  ) {
    throw createHttpError(
      "RUNOFF_CANDIDACY_CANNOT_BE_WITHDRAWN",
      409
    );
  }

  if (
    candidate.election.status !==
      "NOMINATIONS_OPEN" &&
    candidate.election.status !==
      "VOTING_OPEN"
  ) {
    throw createHttpError(
      "CANDIDACY_CANNOT_BE_WITHDRAWN",
      409
    );
  }

  if (
    candidate.status !== "ELIGIBLE"
  ) {
    throw createHttpError(
      "CANDIDACY_NOT_ACTIVE",
      409
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const updatedCandidate =
        await transaction.teamElectionCandidate.update({
          where: {
            id: candidate.id,
          },
          data: {
            status: "WITHDRAWN",
            decidedAt: new Date(),
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "ELECTION_CANDIDACY_WITHDRAWN",
          entityType:
            "TEAM_CANDIDACY",
          entityId:
            candidate.id,
          reason: input.reason,
          outcome: "WITHDRAWN",
          metadata: {
            electionId:
              input.electionId,
            electionType:
              candidate.election.type,
          },
        },
        transaction
      );

      return updatedCandidate;
    }
  );
}

export async function castTeamElectionVote(
  input: {
    electionId: string;
    candidateId: string;
    actor: ElectionActor;
  }
) {
  const currentDate = new Date();

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
        opensAt: true,
        closesAt: true,
      },
    });

  if (!election) {
    throw createHttpError(
      "ELECTION_NOT_FOUND",
      404
    );
  }

  if (
    election.status !== "VOTING_OPEN"
  ) {
    throw createHttpError(
      "ELECTION_VOTING_NOT_OPEN",
      409
    );
  }

  if (
    currentDate.getTime() <
      election.opensAt.getTime() ||
    currentDate.getTime() >=
      election.closesAt.getTime()
  ) {
    throw createHttpError(
      "ELECTION_OUTSIDE_VOTING_PERIOD",
      409
    );
  }

  const eligibleVoterIds =
    await getEligibleElectionVoterIds(
      election.type
    );

  if (
    !eligibleVoterIds.includes(
      input.actor.id
    )
  ) {
    throw createHttpError(
      "VOTER_NOT_ELIGIBLE",
      403
    );
  }

  const candidate =
    await prisma.teamElectionCandidate.findUnique({
      where: {
        electionId_candidateId: {
          electionId:
            election.id,
          candidateId:
            input.candidateId,
        },
      },
      select: {
        id: true,
        status: true,
      },
    });

  if (
    !candidate ||
    candidate.status !== "ELIGIBLE"
  ) {
    throw createHttpError(
      "CANDIDATE_NOT_AVAILABLE",
      404
    );
  }

  const existingVote =
    await prisma.teamElectionVote.findUnique({
      where: {
        candidateId_voterId_round: {
          candidateId:
            candidate.id,
          voterId:
            input.actor.id,
          round:
            election.currentRound,
        },
      },
      select: {
        id: true,
      },
    });

  if (existingVote) {
    throw createHttpError(
      "VOTE_ALREADY_CAST_FOR_CANDIDATE_IN_ROUND",
      409
    );
  }

  const selectionLimit =
    election.runoffSeatCount ??
    election.seatCount;

  const votesAlreadyCast =
    await prisma.teamElectionVote.count({
      where: {
        electionId:
          election.id,
        voterId:
          input.actor.id,
        round:
          election.currentRound,
      },
    });

  if (
    votesAlreadyCast >= selectionLimit
  ) {
    throw createHttpError(
      "VOTER_SELECTION_LIMIT_REACHED",
      409
    );
  }

  return prisma.$transaction(
    async (transaction) => {
      const vote =
        await transaction.teamElectionVote.create({
          data: {
            electionId:
              election.id,
            candidateId:
              candidate.id,
            voterId:
              input.actor.id,
            round:
              election.currentRound,
          },
        });

      await createAuditEvent(
        {
          actorId: input.actor.id,
          actorType: "USER",
          actorLabel:
            input.actor.username,
          action:
            "TEAM_ELECTION_VOTE_CAST",
          entityType:
            "TEAM_ELECTION",
          entityId:
            election.id,
          reason:
            "Election vote cast",
          outcome: "RECORDED",
          metadata: {
            electionType:
              election.type,
            candidateId:
              input.candidateId,
            round:
              election.currentRound,
            selectionsUsed:
              votesAlreadyCast + 1,
            selectionLimit,
          },
        },
        transaction
      );

      return {
        vote,
        round:
          election.currentRound,
        selectionsUsed:
          votesAlreadyCast + 1,
        selectionLimit,
      };
    }
  );
}