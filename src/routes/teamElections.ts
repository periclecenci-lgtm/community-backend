import type {
  FastifyInstance,
  FastifyRequest,
} from "fastify";
import { z } from "zod";

import { getCommunityAccess } from "../services/communityAccessService.js";
import { completeTeamElectionRound } from "../services/teamElectionCompletionService.js";
import { changeTeamElectionPhase } from "../services/teamElectionLifecycleService.js";
import {
  castTeamElectionVote,
  submitElectionCandidate,
  withdrawElectionCandidate,
} from "../services/teamElectionParticipationService.js";
import {
  createTeamElection,
  getTeamElectionDashboard,
} from "../services/teamElectionService.js";
import { prisma } from "../shared/prisma.js";
import { requireSessionUser } from "../shared/session.js";

const electionParamsSchema = z.object({
  electionId: z.string().uuid(),
});

const candidateParamsSchema = z.object({
  electionId: z.string().uuid(),
  candidateId: z.string().uuid(),
});

const createElectionSchema = z
  .object({
    type: z.enum([
      "USER_MANAGEMENT",
      "DAO_COUNCIL",
    ]),
    title: z
      .string()
      .trim()
      .min(3)
      .max(200),
    description: z
      .string()
      .trim()
      .min(10)
      .max(5000),
    opensAt: z.coerce.date(),
    closesAt: z.coerce.date(),
    termStartsAt: z.coerce.date(),
    termEndsAt: z.coerce.date(),
  })
  .strict();

const candidacySchema = z
  .object({
    candidateId: z
      .string()
      .uuid()
      .optional(),
    statement: z
      .string()
      .trim()
      .min(10)
      .max(5000),
  })
  .strict();

const withdrawalSchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

const phaseSchema = z
  .object({
    nextStatus: z.enum([
      "NOMINATIONS_OPEN",
      "VOTING_OPEN",
      "CLOSED",
      "CANCELLED",
    ]),
    reason: z
      .string()
      .trim()
      .min(5)
      .max(2000),
  })
  .strict();

const completionSchema = z
  .object({
    runoffOpensAt: z.coerce
      .date()
      .optional(),
    runoffClosesAt: z.coerce
      .date()
      .optional(),
  })
  .strict();

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

async function requireElectionManager(
  request: FastifyRequest,
  electionId: string
) {
  const user =
    await requireSessionUser(request);

  const [access, election] =
    await Promise.all([
      getCommunityAccess(user),

      prisma.teamElection.findUnique({
        where: {
          id: electionId,
        },
        select: {
          type: true,
        },
      }),
    ]);

  if (!election) {
    throw createHttpError(
      "ELECTION_NOT_FOUND",
      404
    );
  }

  const allowed =
    election.type ===
    "USER_MANAGEMENT"
      ? access.permissions
          .technicalAdministration ||
        access.permissions
          .selectSpecializedTeams
      : access.permissions
          .selectSpecializedTeams;

  if (!allowed) {
    throw createHttpError(
      "ELECTION_MANAGEMENT_ACCESS_DENIED",
      403
    );
  }

  return user;
}

export async function teamElectionRoutes(
  app: FastifyInstance
) {
  app.get(
    "/",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      const allowed =
        permissions.communityVote ||
        permissions
          .selectSpecializedTeams ||
        permissions
          .technicalAdministration;

      if (!allowed) {
        return reply.code(403).send({
          ok: false,
          error:
            "ELECTION_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        elections:
          await getTeamElectionDashboard(),
      };
    }
  );

  app.post(
    "/",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      const body =
        createElectionSchema.parse(
          request.body
        );

      const allowed =
        body.type ===
        "USER_MANAGEMENT"
          ? permissions
              .technicalAdministration ||
            permissions
              .selectSpecializedTeams
          : permissions
              .selectSpecializedTeams;

      if (!allowed) {
        return reply.code(403).send({
          ok: false,
          error:
            "ELECTION_CREATION_ACCESS_DENIED",
        });
      }

      const election =
        await createTeamElection({
          type: body.type,
          title: body.title,
          description:
            body.description,
          opensAt: body.opensAt,
          closesAt: body.closesAt,
          termStartsAt:
            body.termStartsAt,
          termEndsAt:
            body.termEndsAt,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        election,
      });
    }
  );

  app.post(
    "/:electionId/candidates",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { electionId } =
        electionParamsSchema.parse(
          request.params
        );

      const body =
        candidacySchema.parse(
          request.body
        );

      const candidate =
        await submitElectionCandidate({
          electionId,
          candidateId:
            body.candidateId ??
            user.id,
          statement:
            body.statement,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        candidate,
      });
    }
  );

  app.post(
    "/:electionId/candidates/:candidateId/withdraw",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const {
        electionId,
        candidateId,
      } = candidateParamsSchema.parse(
        request.params
      );

      const body =
        withdrawalSchema.parse(
          request.body
        );

      const candidate =
        await withdrawElectionCandidate({
          electionId,
          candidateId,
          reason: body.reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        candidate,
      };
    }
  );

  app.post(
    "/:electionId/candidates/:candidateId/votes",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const {
        electionId,
        candidateId,
      } = candidateParamsSchema.parse(
        request.params
      );

      const result =
        await castTeamElectionVote({
          electionId,
          candidateId,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        result,
      });
    }
  );

  app.post(
    "/:electionId/phase",
    async (request) => {
      const { electionId } =
        electionParamsSchema.parse(
          request.params
        );

      const user =
        await requireElectionManager(
          request,
          electionId
        );

      const body =
        phaseSchema.parse(
          request.body
        );

      const election =
        await changeTeamElectionPhase({
          electionId,
          nextStatus:
            body.nextStatus,
          reason: body.reason,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        election,
      };
    }
  );

  app.post(
    "/:electionId/complete",
    async (request) => {
      const { electionId } =
        electionParamsSchema.parse(
          request.params
        );

      const user =
        await requireElectionManager(
          request,
          electionId
        );

      const body =
        completionSchema.parse(
          request.body
        );

      const result =
        await completeTeamElectionRound({
          electionId,

          ...(body.runoffOpensAt !==
          undefined
            ? {
                runoffOpensAt:
                  body.runoffOpensAt,
              }
            : {}),

          ...(body.runoffClosesAt !==
          undefined
            ? {
                runoffClosesAt:
                  body.runoffClosesAt,
              }
            : {}),

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        result,
      };
    }
  );
}