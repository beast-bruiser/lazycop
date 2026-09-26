// Writes card text with an LLM (Granite on watsonx.ai). Without credentials every method returns
// nothing and LazyCop keeps working with Bob's own words only.

export interface CardWriter {
  /** Other plausible readings of what the developer meant, instead of Bob's assumption. */
  alternatives(input: { task: string; intent: string; assumption: string }): Promise<string[]>;
  /** The behaviour an edit decides that the task never specified, if any. */
  hiddenAssumption(input: { task: string; intent: string; patch: string }): Promise<string | null>;
  /** A passage in the task's documents that contradicts or sharpens Bob's assumption, if any. */
  specCheck(input: { task: string; assumption: string; docs: { path: string; text: string }[] }): Promise<SpecFinding | null>;
}

export interface SpecFinding {
  path: string;
  /** Copied from the document; LazyCop verifies it before showing a card. */
  quote: string;
  /** What the documents say should happen, in a few words. */
  reading: string;
}

const silent: CardWriter = { alternatives: async () => [], hiddenAssumption: async () => null, specCheck: async () => null };

const ALTERNATIVES_PROMPT =
  "You help a developer check an AI coding agent's assumption before it writes code. Given the task and the agent's " +
  "assumption, give 2 different concrete readings the developer may have meant instead. Each under 15 words, " +
  "stated positively (not 'not X'). Reply with only a JSON array of strings.";

const HIDDEN_PROMPT =
  "You help a developer understand an AI coding agent's edit. Given the task, the agent's stated intent and a " +
  "unified diff, name the single most important behaviour the diff decides that the task did not specify: a " +
  "default, an edge case, a missing value, a unit or a timezone. One statement of what the code does, under 20 " +
  "words. If there is nothing notable, reply []. Reply with only a JSON array of at most 1 string.";

const SPEC_PROMPT =
  "You check an AI coding agent's assumption against the project's documents. If a passage in the documents " +
  "contradicts the assumption or makes it more precise, reply with only a JSON object: {\"path\": the document's path, " +
  "\"quote\": one or two sentences copied exactly from that document, \"reading\": what the documents say should " +
  "happen, under 20 words}. If the documents say nothing that bears on the assumption, reply with only {}.";

/** Pulls the first JSON object out of a model reply, if it has the fields of a finding. */
export function parseFinding(reply: string): SpecFinding | null {
  const m = reply.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const o = JSON.parse(m[0]) as Record<string, unknown>;
    const [path, quote, reading] = [o.path, o.quote, o.reading].map((v) => (typeof v === "string" ? v.trim() : ""));
    return path && quote && reading ? { path, quote, reading } : null;
  } catch {
    return null;
  }
}

/** Pulls the first JSON array of strings out of a model reply. */
export function parseList(reply: string): string[] {
  const m = reply.match(/\[[\s\S]*\]/);
  if (!m) return [];
  try {
    const list = JSON.parse(m[0]) as unknown;
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === "string" && x.trim() !== "").map((x) => x.trim()) : [];
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
    alternatives: async ({ task, intent, assumption }) =>
      parseList(await ask(ALTERNATIVES_PROMPT, `Task: ${task}\nAgent's intent: ${intent}\nAgent's assumption: ${assumption}`)).slice(0, 2),
    hiddenAssumption: async ({ task, intent, patch }) =>
      parseList(await ask(HIDDEN_PROMPT, `Task: ${task}\nAgent's intent: ${intent}\nDiff:\n${patch.slice(0, 6000)}`))[0] ?? null,
    specCheck: async ({ task, assumption, docs }) => {
      if (docs.length === 0) return null;
      const corpus = docs.map((d) => `=== ${d.path} ===\n${d.text}`).join("\n\n");
      return parseFinding(await ask(SPEC_PROMPT, `Task: ${task}\nAgent's assumption: ${assumption}\n\nDocuments:\n${corpus}`, 220));
    },
  };
}

let writer: CardWriter | null = null;

/** The configured writer: watsonx.ai when WATSONX_API_KEY and WATSONX_PROJECT_ID are set, else silent. */
export function cardWriter(): CardWriter {
  if (writer) return writer;
  const { WATSONX_API_KEY: key, WATSONX_PROJECT_ID: project } = process.env;
  writer = key && project
    ? watsonx(key, project, process.env.WATSONX_URL ?? "https://us-south.ml.cloud.ibm.com", process.env.WATSONX_MODEL ?? "ibm/granite-4-h-small", Number(process.env.LAZYCOP_LLM_MAX_CALLS ?? 60), process.env.WATSONX_IAM_URL ?? "https://iam.cloud.ibm.com/identity/token")
    : silent;
  return writer;
}

/** Tests replace the writer; null restores the configured one. */
export function setCardWriter(next: CardWriter | null): void {
  writer = next;
}
