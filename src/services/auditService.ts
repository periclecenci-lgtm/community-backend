import {
  type AuditActorType,
  type AuditEntityType,
  type Prisma,
} from "@prisma/client";

import { prisma } from "../shared/prisma.js";

type AuditDatabaseClient = Pick<
  Prisma.TransactionClient,
  "auditEvent"
>;

export type CreateAuditEventInput = {
  actorId?: string | null;
  actorType: AuditActorType;
  actorLabel: string;
  action: string;
  entityType: AuditEntityType;
  entityId?: string | null;
  reason?: string | null;
  outcome?: string | null;
  metadata?: Prisma.InputJsonValue;
};

export async function createAuditEvent(
  input: CreateAuditEventInput,
  database: AuditDatabaseClient = prisma
) {
  return database.auditEvent.create({
    data: {
      actorId: input.actorId ?? null,
      actorType: input.actorType,
      actorLabel: input.actorLabel,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      reason: input.reason ?? null,
      outcome: input.outcome ?? null,
      ...(input.metadata !== undefined
        ? {
            metadata: input.metadata,
          }
        : {}),
    },
  });
}