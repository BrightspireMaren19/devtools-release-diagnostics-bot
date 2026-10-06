import type { BuildEvent, Evidence } from "./knowledge_retrieval.js";

export type Diagnosis = {
  decision: "block_release" | "review" | "continue";
  summary: string;
  evidence: Evidence[];
};

export function decideDiagnosis(event: BuildEvent, evidence: Evidence[]): Diagnosis {
  const strongEvidence = evidence.some((item) => item.score >= 0.75);
  if (event.severity === "critical" && strongEvidence) {
    return {
      decision: "block_release",
      summary: "A critical event matches a runbook closely; pause the release and follow the cited diagnostic.",
      evidence,
    };
  }
  if (event.severity === "critical" || event.severity === "warning") {
    return {
      decision: "review",
      summary: "The event needs an engineer to review the retrieved runbook context before proceeding.",
      evidence,
    };
  }
  return {
    decision: "continue",
    summary: "The event is informational; retain the evidence with the build record.",
    evidence,
  };
}
