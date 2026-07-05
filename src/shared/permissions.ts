import type { UserRole } from "@prisma/client";

export type CommunityTeamName =
  | "USER_MANAGEMENT"
  | "DAO_COUNCIL"
  | "DEVELOPMENT";

export type CommunityPermissions = {
  communityControlPanel: boolean;

  communityVote: boolean;

  moderatePosts: boolean;
  moderateComments: boolean;

  createReports: boolean;
  reviewReports: boolean;
  resolveModeration: boolean;

  manageUsers: boolean;

  reviewProjects: boolean;
  manageProjects: boolean;
  technicalProjectAssessment: boolean;

  selectSpecializedTeams: boolean;

  protocolGovernance: boolean;
  daoCouncil: boolean;
  protocolProposal: boolean;
  protocolVote: boolean;
  protocolTechnicalAssessment: boolean;
  implementProtocolDecision: boolean;

  developmentTools: boolean;
  technicalAdministration: boolean;

  admin: boolean;
};

export function buildCommunityPermissions(input: {
  role: UserRole;
  isCommander: boolean;
  teams: readonly CommunityTeamName[];
}): CommunityPermissions {
  const isAdmin =
    input.role === "ADMIN";

  const isUserManagement =
    input.isCommander &&
    input.teams.includes(
      "USER_MANAGEMENT"
    );

  const isDaoCouncil =
    input.isCommander &&
    isUserManagement &&
    input.teams.includes(
      "DAO_COUNCIL"
    );

  const isDevelopment =
    input.teams.includes(
      "DEVELOPMENT"
    );

  return {
    communityControlPanel:
      input.isCommander ||
      isUserManagement ||
      isDaoCouncil ||
      isDevelopment ||
      isAdmin,

    communityVote:
      input.isCommander,

    moderatePosts:
      input.isCommander,

    moderateComments:
      input.isCommander,

    createReports:
      input.isCommander,

    reviewReports:
      isUserManagement,

    resolveModeration:
      isUserManagement,

    manageUsers:
      isUserManagement,

    reviewProjects:
      input.isCommander,

    manageProjects:
      isUserManagement,

    technicalProjectAssessment:
      isDevelopment,

    selectSpecializedTeams:
      isUserManagement,

    protocolGovernance:
      isDaoCouncil ||
      isDevelopment,

    daoCouncil:
      isDaoCouncil,

    protocolProposal:
      isDaoCouncil,

    protocolVote:
      isDaoCouncil,

    protocolTechnicalAssessment:
      isDevelopment,

    implementProtocolDecision:
      isDevelopment,

    developmentTools:
      isDevelopment,

    technicalAdministration:
      isAdmin,

    admin:
      isAdmin,
  };
}