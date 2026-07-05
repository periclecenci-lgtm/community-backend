import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getCommunityAccess } from "../services/communityAccessService.js";
import {
  activateProtocolServiceProposal,
  assessProtocolServiceProposal,
  castProtocolServiceVote,
  createProtocolServiceProposal,
  getProtocolGovernanceDashboard,
} from "../services/protocolGovernanceService.js";
import { requireSessionUser } from "../shared/session.js";

const proposalParamsSchema = z.object({
  proposalId: z.string().uuid(),
});

const createProposalSchema = z
  .object({
    serviceType: z.enum([
      "ORACLE",
      "DEX",
      "RPC_PROVIDER",
      "DATA_PROVIDER",
      "BRIDGE",
      "AUTOMATION",
      "OTHER",
    ]),

    name: z
      .string()
      .trim()
      .min(2)
      .max(200),

    description: z
      .string()
      .trim()
      .min(20)
      .max(10_000),

    chainId: z
      .number()
      .int()
      .positive()
      .optional(),

    contractAddress: z
      .string()
      .trim()
      .min(1)
      .max(200)
      .optional(),

    endpoint: z
      .string()
      .trim()
      .url()
      .max(2000)
      .optional(),
  })
  .strict();

const voteSchema = z
  .object({
    vote: z.enum([
      "APPROVE",
      "REJECT",
    ]),

    reason: z
      .string()
      .trim()
      .min(5)
      .max(5000)
      .optional(),
  })
  .strict();

const technicalAssessmentSchema = z
  .object({
    decision: z.enum([
      "APPROVE",
      "REJECT",
    ]),

    assessment: z
      .string()
      .trim()
      .min(20)
      .max(20_000),
  })
  .strict();

const activationSchema = z
  .object({
    transactionHash: z
      .string()
      .trim()
      .min(10)
      .max(200),

    implementationNotes: z
      .string()
      .trim()
      .min(10)
      .max(10_000),
  })
  .strict();

export async function protocolGovernanceRoutes(
  app: FastifyInstance
) {
  app.get(
    "/",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.protocolGovernance) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROTOCOL_GOVERNANCE_ACCESS_DENIED",
        });
      }

      return {
        ok: true,
        governance:
          await getProtocolGovernanceDashboard(),
        permissions,
      };
    }
  );

  app.post(
    "/proposals",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.protocolProposal) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROTOCOL_PROPOSAL_ACCESS_DENIED",
        });
      }

      const body =
        createProposalSchema.parse(
          request.body
        );

      const proposal =
        await createProtocolServiceProposal({
          serviceType:
            body.serviceType,
          name: body.name,
          description:
            body.description,

          ...(body.chainId !== undefined
            ? {
                chainId:
                  body.chainId,
              }
            : {}),

          ...(body.contractAddress !==
          undefined
            ? {
                contractAddress:
                  body.contractAddress,
              }
            : {}),

          ...(body.endpoint !== undefined
            ? {
                endpoint:
                  body.endpoint,
              }
            : {}),

          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return reply.code(201).send({
        ok: true,
        proposal,
      });
    }
  );

  app.post(
    "/proposals/:proposalId/votes",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (!permissions.protocolVote) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROTOCOL_VOTE_ACCESS_DENIED",
        });
      }

      const { proposalId } =
        proposalParamsSchema.parse(
          request.params
        );

      const body =
        voteSchema.parse(
          request.body
        );

      const result =
        await castProtocolServiceVote({
          proposalId,
          vote: body.vote,

          ...(body.reason !== undefined
            ? {
                reason:
                  body.reason,
              }
            : {}),

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
    "/proposals/:proposalId/technical-assessment",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (
        !permissions
          .protocolTechnicalAssessment
      ) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROTOCOL_TECHNICAL_ASSESSMENT_ACCESS_DENIED",
        });
      }

      const { proposalId } =
        proposalParamsSchema.parse(
          request.params
        );

      const body =
        technicalAssessmentSchema.parse(
          request.body
        );

      const proposal =
        await assessProtocolServiceProposal({
          proposalId,
          decision:
            body.decision,
          assessment:
            body.assessment,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        proposal,
      };
    }
  );

  app.post(
    "/proposals/:proposalId/activate",
    async (request, reply) => {
      const user =
        await requireSessionUser(request);

      const { permissions } =
        await getCommunityAccess(user);

      if (
        !permissions
          .implementProtocolDecision
      ) {
        return reply.code(403).send({
          ok: false,
          error:
            "PROTOCOL_IMPLEMENTATION_ACCESS_DENIED",
        });
      }

      const { proposalId } =
        proposalParamsSchema.parse(
          request.params
        );

      const body =
        activationSchema.parse(
          request.body
        );

      const proposal =
        await activateProtocolServiceProposal({
          proposalId,
          transactionHash:
            body.transactionHash,
          implementationNotes:
            body.implementationNotes,
          actor: {
            id: user.id,
            username: user.username,
          },
        });

      return {
        ok: true,
        proposal,
      };
    }
  );
}