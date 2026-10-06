import { initializeRunbooks } from "./knowledge_retrieval.js";

const runbooks = [
  {
    id: "build-artifact-checksum",
    stage: "build",
    text: "When an artifact checksum differs, rebuild from a clean workspace and compare the lockfile before publishing.",
  },
  {
    id: "release-migration-order",
    stage: "release",
    text: "When a release reports a missing database column, pause promotion and apply the backward-compatible migration before retrying.",
  },
  {
    id: "release-health-regression",
    stage: "release",
    text: "When health checks regress after deployment, pause promotion, inspect the first failing probe, and restore the previous artifact.",
  },
];

await initializeRunbooks(runbooks);
console.log(`Indexed ${runbooks.length} developer-tools runbooks.`);
