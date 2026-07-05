import type { FastifyInstance } from "fastify";
import { z } from "zod";

import { getCommunityAccess } from "../services/communityAccessService.js";
import { getTeamElectionDetails } from "../services/teamElectionQueryService.js";
import { requireSessionUser } from "../shared/session.js";

const electionParamsSchema = z.object({
  electionId: z.string().uuid(),
});

export async function teamElectionDetailsRoutes(
  app: FastifyInstance
) {
  app.get(
    "/:electionId",
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

      const { electionId } =
        electionParamsSchema.parse(
          request.params
        );

      const result =
        await getTeamElectionDetails(
          electionId,
          user.id
        );

      return {
        ok: true,
        ...result,
      };
    }
  );
}