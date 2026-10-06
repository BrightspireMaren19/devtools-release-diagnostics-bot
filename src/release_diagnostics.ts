import express from "express";
import { z } from "zod";
import { decideDiagnosis } from "./diagnosis_policy.js";
import { findRunbookEvidence, InfraiError } from "./knowledge_retrieval.js";

const BuildEventBody = z.object({
  service: z.string().min(1),
  version: z.string().min(1),
  stage: z.enum(["build", "release"]),
  severity: z.enum(["info", "warning", "critical"]),
  diagnostic: z.string().min(3),
}).strict();

const app = express();
app.use(express.json({ limit: "32kb" }));

app.post("/diagnose", async (request, response) => {
  const parsed = BuildEventBody.safeParse(request.body);
  if (!parsed.success) {
    response.status(400).json({ error: "invalid_build_event", issues: parsed.error.issues });
    return;
  }
  try {
    const evidence = await findRunbookEvidence(parsed.data);
    response.json(decideDiagnosis(parsed.data, evidence));
  } catch (error) {
    if (error instanceof InfraiError) {
      response.status(error.status >= 400 && error.status < 500 ? error.status : 502).json({
        error: error.code,
        details: error.details,
      });
      return;
    }
    response.status(502).json({ error: "diagnostic_dependency_error" });
  }
});

const port = Number(process.env.PORT ?? 3000);
app.listen(port, () => console.log(`Release diagnostics listening on http://localhost:${port}`));
