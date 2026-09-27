// Writes text with an LLM (Granite on watsonx.ai): the knowledge agent's spec check and the risk review
// of a finished change. Without credentials every method returns nothing and LazyCop keeps working
// with Bob's own words only.
import type { RiskArea } from "@lazycops/contracts";

export interface CardWriter {
  /** A passage in the task's documents that contradicts or sharpens Bob's assumption, if any. */
  specCheck(input: { task: string; assumption: string; docs: { path: string; text: string }[] }): Promise<SpecFinding | null>;
  /** The riskiest places in the session's diffs, most risky first. */
  reviewRisks(input: { task: string; summary: string; diffs: { file: string; patch: string }[] }): Promise<RiskArea[]>;
  /** A second opinion on a finding: false when the passage says nothing the assumption contradicts or leaves out. */
  passageMatters?(input: { passage: string; assumption: string }): Promise<boolean>;
}

export interface SpecFinding {
  path: string;
  /** Copied from the document; LazyCop verifies it before showing a card. */
  quote: string;
  /** What the documents say should happen, in a few words. */
  reading: string;
}

const silent: CardWriter = { specCheck: async () => null, reviewRisks: async () => [] };

const SPEC_PROMPT =
  "You check an AI coding agent's assumption against the project's documents. Only report a passage that " +
  "contradicts the assumption, or that adds a detail the assumption leaves out. If the assumption already says what " +
  "the documents say, that is not a finding. Reply with only a JSON object: {\"relation\": \"contradicts\" or " +
  "\"adds_detail\", \"path\": the document's path, \"quote\": one or two sentences copied exactly from that document, " +
  "\"reading\": what the documents say should happen, under 20 words}. Otherwise, reply with only {}.";

const RISK_PROMPT =
  "You review an AI coding agent's finished change for a developer. Given the task, the agent's summary and the " +
  "diffs, name at most 3 places most likely to break something or surprise the developer: an unhandled case, a " +
  "changed default, a missing check, a behaviour the task did not ask for. Be concrete; skip style and generic " +
  "advice. Reply with only a JSON array of {\"file\": a file from the diffs, \"line\": the new line number, " +
  "\"risk\": what could go wrong, under 25 words}. If nothing is notably risky, reply [].";

const MATTERS_PROMPT = "Does the passage say something that the assumption contradicts or leaves out? Reply with only yes or no.";

/** Pulls the first JSON object out of a model reply. */
function parseObject(reply: string): Record<string, unknown> | null {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as unknown;
    return o && typeof o === "object" && !Array.isArray(o) ? (o as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/**
 * A spec finding, if the reply has one. A passage that only repeats the assumption is not a finding:
 * relation must say it contradicts it or adds a detail.
 */
export function parseFinding(reply: string): SpecFinding | null {
  const o = parseObject(reply);
  if (!o || (o.relation !== undefined && o.relation !== "contradicts" && o.relation !== "adds_detail")) return null;
  const [path, quote, reading] = [o.path, o.quote, o.reading].map(str);
  return path && quote && reading ? { path, quote, reading } : null;
}

/** Pulls the risk areas out of a model reply, keeping only well-formed ones. */
export function parseRisks(reply: string): RiskArea[] {
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const list = JSON.parse(m[0]) as unknown;
    if (!Array.isArray(list)) return [];
    return list.flatMap((o) => {
      if (!o || typeof o !== "object") return [];
      const { file, line, risk } = o as Record<string, unknown>;
      if (typeof file !== "string" || !file.trim() || typeof risk !== "string" || !risk.trim()) return [];
      const at = typeof line === "number" && Number.isInteger(line) && line > 0 ? { line } : {};
      return [{ file: file.trim(), ...at, risk: risk.trim() }];
    });
  } catch {
    return [];
  }
}

function watsonx(apiKey: string, projectId: string, baseUrl: string, model: string, maxCalls: number, iamUrl: string): CardWriter {
  let token: { value: string; expires: number } | null = null;
  let calls = 0;

  async function bearer(): Promise<string> {
    if (token && Date.now() < token.expires - 60_000) return token.value;
    const res = await fetch(iamUrl, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({ grant_type: "urn:ibm:params:oauth:grant-type:apikey", apikey: apiKey }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`IAM token request failed: ${res.status}`);
    const body = (await res.json()) as { access_token: string; expires_in: number };
    token = { value: body.access_token, expires: Date.now() + body.expires_in * 1000 };
    return token.value;
  }

  async function ask(system: string, user: string, maxTokens = 120): Promise<string> {
    if (calls >= maxCalls) return "";
    calls++;
    try {
      const res = await fetch(`${baseUrl}/ml/v1/text/chat?version=2024-10-07`, {
        method: "POST",
        headers: { authorization: `Bearer ${await bearer()}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          model_id: model,
          project_id: projectId,
          messages: [{ role: "system", content: system }, { role: "user", content: user }],
          max_tokens: maxTokens,
          temperature: 0.2,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return "";
      const body = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      return body.choices?.[0]?.message?.content ?? "";
    } catch {
      return ""; // the card simply goes without LLM help
    }
  }

  return {
    // Tested on Granite: a yes/no question is steadier than the open finding, and "no" only on clear agreement.
    passageMatters: async ({ passage, assumption }) =>
      !/^\s*no\b/i.test(await ask(MATTERS_PROMPT, `Passage: ${passage}\nAssumption: ${assumption}`, 3)),
    specCheck: async ({ task, assumption, docs }) => {
      if (docs.length === 0) return null;
      const corpus = docs.map((d) => `=== ${d.path} ===\n${d.text}`).join("\n\n");
      return parseFinding(await ask(SPEC_PROMPT, `Task: ${task}\nAgent's assumption: ${assumption}\n\nDocuments:\n${corpus}`, 220));
    },
    reviewRisks: async ({ task, summary, diffs }) => {
      if (diffs.length === 0) return [];
      const changes = diffs.map((d) => `=== ${d.file} ===\n${d.patch}`).join("\n\n").slice(0, 12_000);
      return parseRisks(await ask(RISK_PROMPT, `Task: ${task}\nAgent's summary: ${summary}\n\nDiffs:\n${changes}`, 300));
    },
  };
}

let writer: CardWriter | null = null;

/**
 * The configured writer: watsonx.ai when an API key and WATSONX_PROJECT_ID are set, else silent.
 * The key is IBM_CLOUD_API_KEY, the hackathon template's name; WATSONX_API_KEY still works.
 */
export function cardWriter(): CardWriter {
  if (writer) return writer;
  const key = process.env.IBM_CLOUD_API_KEY ?? process.env.WATSONX_API_KEY;
  const project = process.env.WATSONX_PROJECT_ID;
  writer = key && project
    ? watsonx(key, project, process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com", process.env.WATSONX_MODEL ?? "ibm/granite-4-h-small", Number(process.env.LAZYCOP_LLM_MAX_CALLS ?? 60), process.env.WATSONX_IAM_URL ?? "https://iam.cloud.ibm.com/identity/token")
    : silent;
  return writer;
}

/** Tests replace the writer; null restores the configured one. */
export function setCardWriter(next: CardWriter | null): void {
  writer = next;
}
