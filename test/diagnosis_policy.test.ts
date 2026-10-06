import assert from "node:assert/strict";
import test from "node:test";
import { decideDiagnosis } from "../src/diagnosis_policy.js";

test("a critical release with strong runbook evidence is blocked", () => {
  const result = decideDiagnosis(
    {
      service: "artifact-registry",
      version: "2026.09.04",
      stage: "release",
      severity: "critical",
      diagnostic: "health probe regression after deployment",
    },
    [{ text: "Pause promotion after a health probe regression.", score: 0.91 }],
  );

  assert.equal(result.decision, "block_release");
  assert.equal(result.evidence[0].score, 0.91);
});

test("weak evidence sends a warning event to review", () => {
  const result = decideDiagnosis(
    {
      service: "docs-builder",
      version: "1842",
      stage: "build",
      severity: "warning",
      diagnostic: "generated reference count changed",
    },
    [{ text: "Check generated references.", score: 0.54 }],
  );

  assert.equal(result.decision, "review");
});
