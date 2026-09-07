// MathTutor — AI provider abstraction for word-problem flavor text.
//
// SERVER-ONLY: API keys live in non-NEXT_PUBLIC_ env vars and must never be
// bundled to the browser. Safe vars: AI_PROVIDER, AI_ENDPOINT, AI_API_KEY,
// AI_MODEL. NEVER read NEXT_PUBLIC_* secrets here and NEVER import this module
// from client components ("use client") or the grading path
// (src/lib/math/grading.ts grades deterministically against canonical answers
// only — no LLM, no network).
//
// Grading invariant: grade()/gradeAttempt() in math/grading.ts MUST NOT import
// this file (directly or transitively). Word problems generated here carry a
// deterministic numeric `answer` owned by the math engine; the provider only
// supplies narrative wording, validated by isNumericAnswerValid() with a
// template fallback so generation NEVER throws.

export interface WordProblemRequest {
  skillId: string;
  /** Canonical numeric operands owned by the math engine. */
  a: number;
  b: number;
  /** Canonical answer string (e.g. "7", "3.5", "3/4"). */
  answer: string;
  gradeLevel?: number;
}

export interface WordProblemResult {
  prompt: string;
  /** Always the request's canonical answer — never model output. */
  answer: string;
  source: "ai" | "template";
}

/** Minimal text-generation surface any vendor adapter must satisfy. */
export interface AIProvider {
  readonly name: string;
  generate(prompt: string): Promise<string>;
}

/** Deterministic stand-in for dev/test. Returns canned text, never calls network. */
export class MockProvider implements AIProvider {
  readonly name = "mock";
  constructor(private readonly text = "") {}
  async generate(prompt: string): Promise<string> {
    void prompt;
    return this.text;
  }
}

/** A provider that always fails — used to exercise the template fallback. */
export class FailingProvider implements AIProvider {
  readonly name = "failing";
  async generate(_prompt: string): Promise<string> {
    throw new Error("mock provider failure");
  }
}

export interface HttpProviderOptions {
  endpoint: string;
  apiKey: string;
  model?: string;
}

/**
 * Generic server-side HTTP adapter. Sends { model, prompt } as JSON and reads
 * { text } back. Server only — constructed with AI_API_KEY (no NEXT_PUBLIC_
 * prefix). Kept vendor-neutral; wire a real endpoint via AI_ENDPOINT.
 */
export class HttpProvider implements AIProvider {
  readonly name = "http";
  constructor(private readonly options: HttpProviderOptions) {}
  async generate(prompt: string): Promise<string> {
    const res = await fetch(this.options.endpoint, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.options.apiKey}`,
      },
      body: JSON.stringify({ model: this.options.model ?? "default", prompt }),
    });
    if (!res.ok) throw new Error(`AI endpoint ${res.status}`);
    const data: unknown = await res.json();
    if (typeof data === "object" && data !== null && "text" in data && typeof data.text === "string") {
      return data.text;
    }
    throw new Error("AI endpoint returned no text");
  }
}

export interface EnvLike {
  AI_PROVIDER?: string;
  AI_ENDPOINT?: string;
  AI_API_KEY?: string;
  AI_MODEL?: string;
  [key: string]: string | undefined;
}

/**
 * Env-keyed factory. AI_PROVIDER=mock (or missing keys) -> MockProvider;
 * provider names fall back to MockProvider (never throw — callers render
 * practice content regardless).
 */
export function createProviderFromEnv(env: EnvLike = process.env): AIProvider {
  const kind = (env.AI_PROVIDER ?? "").toLowerCase();
  if (kind === "http" && env.AI_ENDPOINT && env.AI_API_KEY) {
    return new HttpProvider({ endpoint: env.AI_ENDPOINT, apiKey: env.AI_API_KEY, model: env.AI_MODEL });
  }
  return new MockProvider();
}

/** Deterministic template used when AI is unavailable or its output is unusable. */
export function buildTemplateWordProblem(req: WordProblemRequest): WordProblemResult {
  return {
    prompt: `Maya has ${req.a} stickers. Her brother gives her ${req.b} more. How many stickers does Maya have now?`,
    answer: req.answer,
    source: "template",
  };
}

function parseNumeric(raw: string): number | null {
  const s = raw.trim().replace(/,/g, "").replace(/\s+/g, "");
  if (s.length === 0) return null;
  const frac = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (frac) {
    const denom = Number(frac[2]);
    if (denom === 0) return null;
    const v = Number(frac[1]) / denom;
    return Number.isFinite(v) ? v : null;
  }
  const v = Number(s);
  return Number.isFinite(v) ? v : null;
}

/**
 * Deterministic numeric validation for the canonical answer. Accepts
 * integers, decimals, and "a/b" fractions (commas/whitespace tolerated).
 * Rejects NaN/Infinity, empty strings, and non-numeric text.
 */
export function isNumericAnswerValid(answer: string): boolean {
  return parseNumeric(answer) !== null;
}

/**
 * Word-problem wrapper: asks the provider for narrative wording, then keeps
 * ONLY the wording — the returned `answer` is always req.answer and the
 * request answer must pass isNumericAnswerValid(). Any provider failure,
 * empty text, or invalid canonical answer falls back to the deterministic
 * template (which echoes req.answer verbatim). Never throws, never calls the
 * grading path.
 */
export async function generateWordProblem(
  req: WordProblemRequest,
  provider: AIProvider = createProviderFromEnv(),
): Promise<WordProblemResult> {
  if (!isNumericAnswerValid(req.answer)) return buildTemplateWordProblem(req);
  const prompt =
    `Write one 4th-grade word problem for skill ${req.skillId} using the ` +
    `numbers ${req.a} and ${req.b}. Reply with only the story and question. ` +
    `The answer must be ${req.answer}.`;
  try {
    const text = (await provider.generate(prompt)).trim();
    if (!text) return buildTemplateWordProblem(req);
    return { prompt: text, answer: req.answer, source: "ai" };
  } catch {
    return buildTemplateWordProblem(req);
  }
}
