export const APPROVAL_TRANSITIONS = Object.freeze({
  DRAFT: ["IN_REVIEW"],
  IN_REVIEW: ["CHANGES_REQUESTED", "APPROVED"],
  CHANGES_REQUESTED: ["IN_REVIEW"],
  APPROVED: ["PUBLISHED", "OBSOLETE"],
  PUBLISHED: ["OBSOLETE"],
  OBSOLETE: ["ARCHIVED"],
  ARCHIVED: [],
});

export function canTransition(from, to) {
  return APPROVAL_TRANSITIONS[from]?.includes(to) ?? false;
}

export function relationshipFingerprint({ sourceNodeId, targetNodeId, relationshipTypeId, direction = "DIRECTED" }) {
  if (!sourceNodeId || !targetNodeId || !relationshipTypeId) {
    throw new TypeError("sourceNodeId, targetNodeId and relationshipTypeId are required");
  }
  return [sourceNodeId, relationshipTypeId, targetNodeId, direction].join(":");
}

export function hasDuplicateRelationship(candidate, relationships) {
  const key = relationshipFingerprint(candidate);
  return relationships.some((relationship) => relationshipFingerprint(relationship) === key);
}

export function validateRaci(assignments) {
  const roles = new Set(assignments.map(({ role }) => role));
  const errors = [];
  if (!roles.has("RESPONSIBLE")) errors.push("RACI_REQUIRES_RESPONSIBLE");
  if (!roles.has("ACCOUNTABLE")) errors.push("RACI_REQUIRES_ACCOUNTABLE");
  return { valid: errors.length === 0, errors };
}

export function isActionAllowed({ permissions, action, resource, scope }) {
  return permissions.some((permission) => {
    if (permission.action !== action || permission.resource !== resource) return false;
    if (permission.scope === "GLOBAL") return true;
    if (permission.scope === "DEPARTMENT") return permission.scopeId === scope.departmentId;
    if (permission.scope === "PROCESS") return permission.scopeId === scope.processId;
    if (permission.scope === "DOCUMENT") return permission.scopeId === scope.documentId;
    return false;
  });
}
