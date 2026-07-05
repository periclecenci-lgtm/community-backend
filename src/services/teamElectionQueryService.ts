import { prisma } from "../shared/prisma.js";

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

export async function getTeamElectionDetails(
  electionId: string,
  viewerId: string
) {
  const election =
    await prisma.teamElection.findUnique({
      where: {
        id: electionId,
      },

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
        currentRound: true,
        runoffSeatCount: true,
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

        candidates: {
          orderBy: {
            submittedAt: "asc",
          },

          select: {
            id: true,
            statement: true,
            status: true,
            submittedAt: true,
            decidedAt: true,

            candidate: {
              select: {
                id: true,
                username: true,
              },
            },

            nominatedBy: {
              select: {
                id: true,
                username: true,
              },
            },

            votes: {
              select: {
                voterId: true,
                round: true,
              },
            },
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

  const revealVoteCounts =
    election.status === "CLOSED" ||
    election.status === "COMPLETED" ||
    election.status === "CANCELLED";

  const candidates =
    election.candidates.map(
      (candidate) => {
        const currentRoundVotes =
          candidate.votes.filter(
            (vote) =>
              vote.round ===
              election.currentRound
          );

        const selectedByViewer =
          currentRoundVotes.some(
            (vote) =>
              vote.voterId ===
              viewerId
          );

        return {
          id: candidate.id,
          candidate:
            candidate.candidate,
          nominatedBy:
            candidate.nominatedBy,
          statement:
            candidate.statement,
          status:
            candidate.status,
          submittedAt:
            candidate.submittedAt,
          decidedAt:
            candidate.decidedAt,

          selectedByViewer,

          votes:
            revealVoteCounts
              ? currentRoundVotes.length
              : null,
        };
      }
    );

  const viewerSelections =
    candidates.filter(
      (candidate) =>
        candidate.selectedByViewer
    ).length;

  const selectionLimit =
    election.runoffSeatCount ??
    election.seatCount;

  return {
    election: {
      id: election.id,
      type: election.type,
      status: election.status,
      title: election.title,
      description:
        election.description,
      electorateCount:
        election.electorateCount,
      seatCount:
        election.seatCount,
      maximumPercentBps:
        election.maximumPercentBps,
      bootstrapMinimum:
        election.bootstrapMinimum,
      currentRound:
        election.currentRound,
      runoffSeatCount:
        election.runoffSeatCount,
      snapshotAt:
        election.snapshotAt,
      opensAt:
        election.opensAt,
      closesAt:
        election.closesAt,
      termStartsAt:
        election.termStartsAt,
      termEndsAt:
        election.termEndsAt,
      completedAt:
        election.completedAt,
      createdAt:
        election.createdAt,
      createdBy:
        election.createdBy,

      viewerSelections,
      selectionLimit,
      selectionsRemaining:
        Math.max(
          selectionLimit -
            viewerSelections,
          0
        ),

      voteCountsVisible:
        revealVoteCounts,

      candidates,
    },
  };
}