// Writes card text with an LLM (Granite on watsonx.ai). Without credentials every method returns
// nothing and LazyCop keeps working with Bob's own words only.

export interface CardWriter {
  /** Other plausible readings of what the developer meant, instead of Bob's assumption. */
  alternatives(input: { task: string; intent: string; assumption: string }): Promise<string[]>;
  /** The behaviour an edit decides that the task never specified, with the added line that decides it. */
  hiddenAssumption(input: { task: string; intent: string; patch: string }): Promise<EditFinding | null>;
  /** A passage in the task's documents that contradicts or sharpens Bob's assumption, if any. */
  specCheck(input: { task: string; assumption: string; docs: { path: string; text: string }[] }): Promise<SpecFinding | null>;
  /** A second opinion on a finding: false when the passage says nothing the assumption contradicts or leaves out. */
  passageMatters?(input: { passage: string; assumption: string }): Promise<boolean>;
}

export interface EditFinding {
  /** What the code now does, in a sentence. */
  claim: string;
  /** The added line that makes that decision; LazyCop verifies it before showing a card. */
  line: string;
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
  "default, an edge case, a missing value, a unit or a timezone. Read the added lines (starting with +) carefully: " +
  "state exactly what they do, not what they might do. Reply with only a JSON object: {\"claim\": one statement of " +
  "what the code does, under 20 words, \"line\": the one added line that makes this decision, copied exactly without " +
  "the leading +}. If there is nothing notable, reply with only {}.";

const SPEC_PROMPT =
  "You check an AI coding agent's assumption against the project's documents. Only report a passage that " +
  "contradicts the assumption, or that adds a detail the assumption leaves out. If the assumption already says what " +
  "the documents say, that is not a finding. Reply with only a JSON object: {\"relation\": \"contradicts\" or " +
  "\"adds_detail\", \"path\": the document's path, \"quote\": one or two sentences copied exactly from that document, " +
  "\"reading\": what the documents say should happen, under 20 words}. Otherwise, reply with only {}.";

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

/** An edit finding, if the reply has a real statement and the line it rests on. */
export function parseEditFinding(reply: string): EditFinding | null {
  const o = parseObject(reply);
  if (!o) return null;
  const claim = str(o.claim);
  const line = str(o.line).replace(/^\+\s?/, "");
  return meaningful(claim) && line ? { claim, line } : null;
}

/**
 * True when a model's line says something a developer can agree or disagree with. Small models
 * sometimes answer "nothing notable" with filler instead of an empty list: "unit", "[No notable
 * behavior specified]", "None".
 */
export function meaningful(text: string): boolean {
  const t = text.trim();
  if (t.length < 15 || t.split(/\s+/).length < 4) return false;
  if (/^[\[(<{]/.test(t)) return false;
  return !/^(none|n\/a|nothing)\b|\bno (notable|significant|new|specific|relevant) (behaviou?r|change|assumption|decision)s?\b/i.test(t);
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
      parseList(await ask(ALTERNATIVES_PROMPT, `Task: ${task}\nAgent's intent: ${intent}\nAgent's assumption: ${assumption}`)).filter(meaningful).slice(0, 2),
    hiddenAssumption: async ({ task, intent, patch }) =>
      parseEditFinding(await ask(HIDDEN_PROMPT, `Task: ${task}\nAgent's intent: ${intent}\nDiff:\n${patch.slice(0, 6000)}`, 200)),
    // Tested on Granite: a yes/no question is steadier than the open finding, and "no" only on clear agreement.
    passageMatters: async ({ passage, assumption }) =>
      !/^\s*no\b/i.test(await ask(MATTERS_PROMPT, `Passage: ${passage}\nAssumption: ${assumption}`, 3)),
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
