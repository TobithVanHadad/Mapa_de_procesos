import test from "node:test";
import assert from "node:assert/strict";
import {
  canTransition,
  hasDuplicateRelationship,
  isActionAllowed,
  validateRaci,
} from "../src/domain/policies.mjs";

test("prevents a duplicate directed relationship", () => {
  const relation = { sourceNodeId: "a", targetNodeId: "b", relationshipTypeId: "uses" };
  assert.equal(hasDuplicateRelationship(relation, [relation]), true);
  assert.equal(hasDuplicateRelationship({ ...relation, targetNodeId: "c" }, [relation]), false);
});

test("requires Responsible and Accountable in RACI", () => {
  assert.deepEqual(validateRaci([{ role: "RESPONSIBLE" }]), {
    valid: false,
    errors: ["RACI_REQUIRES_ACCOUNTABLE"],
  });
  assert.equal(validateRaci([{ role: "RESPONSIBLE" }, { role: "ACCOUNTABLE" }]).valid, true);
});

test("permits only valid approval transitions", () => {
  assert.equal(canTransition("DRAFT", "IN_REVIEW"), true);
  assert.equal(canTransition("DRAFT", "PUBLISHED"), false);
  assert.equal(canTransition("PUBLISHED", "DRAFT"), false);
});

test("evaluates permissions against resource scope", () => {
  const permissions = [{ action: "UPDATE", resource: "NODE", scope: "DEPARTMENT", scopeId: "dept-1" }];
  assert.equal(isActionAllowed({ permissions, action: "UPDATE", resource: "NODE", scope: { departmentId: "dept-1" } }), true);
  assert.equal(isActionAllowed({ permissions, action: "UPDATE", resource: "NODE", scope: { departmentId: "dept-2" } }), false);
});
