import { GoogleGenAI } from '@google/genai';

/**
 * One text-generation entry point for the app, with two providers behind it.
 *
 * The prompts in aiCore.ts / gemini.ts are provider-neutral; what differs is the
 * SDK and how JSON output is requested. Gemini takes a typed `responseSchema`
 * (its own Type enum); OpenAI takes a strict JSON Schema via `response_format`.
 * This module accepts the Gemini-shaped params the call sites already build and
 * translates for OpenAI, so the prompts and schemas are written once.
 *
 * Provider selection (first match wins):
 *   LLM_PROVIDER=openai|gemini   explicit
 *   OPENAI_API_KEY set           → openai
 *   GEMINI_API_KEY set           → gemini
 */

export type Provider = 'openai' | 'gemini';

export const OPENAI_DEFAULT_MODEL = 'gpt-5-mini';
export const GEMINI_DEFAULT_MODEL = 'gemini-3-flash-preview';

export interface GenerateParams {
  /** Gemini model name from the call site; ignored for OpenAI (OPENAI_MODEL wins). */
  model?: string;
  contents: string;
  config?: {
    responseMimeType?: string;
    /** Gemini-style schema ({ type: Type.OBJECT, properties, required, items, enum }). */
    responseSchema?: any;
    temperature?: number;
  };
}

export interface GenerateResult {
  text: string;
  provider: Provider;
  model: string;
}

export function resolveProvider(env: NodeJS.ProcessEnv = process.env): Provider | null {
  const explicit = (env.LLM_PROVIDER || '').toLowerCase();
  if (explicit === 'openai' || explicit === 'gemini') return explicit;
  if (env.OPENAI_API_KEY) return 'openai';
  if (env.GEMINI_API_KEY) return 'gemini';
  return null;
}

export function llmStatus(env: NodeJS.ProcessEnv = process.env): { provider: Provider | null; model: string | null; configured: boolean } {
  const provider = resolveProvider(env);
  if (!provider) return { provider: null, model: null, configured: false };
  const model = provider === 'openai'
    ? (env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL)
    : (env.GEMINI_MODEL || GEMINI_DEFAULT_MODEL);
  const configured = provider === 'openai' ? !!env.OPENAI_API_KEY : !!env.GEMINI_API_KEY;
  return { provider, model, configured };
}

export function isLlmConfigured(): boolean {
  return llmStatus().configured;
}

/** The message to show when nothing is set up. */
export const LLM_NOT_CONFIGURED = 'No AI provider is configured on the server. Set OPENAI_API_KEY or GEMINI_API_KEY.';

// ─── Gemini schema → strict JSON Schema ────────────────────────────────────

const TYPE_MAP: Record<string, string> = {
  OBJECT: 'object', ARRAY: 'array', STRING: 'string', NUMBER: 'number',
  INTEGER: 'integer', BOOLEAN: 'boolean', NULL: 'null',
};

/**
 * OpenAI's strict structured outputs require every object to list all of its
 * properties as required and to forbid additional properties. Gemini schemas
 * mark only some fields required; making them all required just means the
 * model always emits the field (an empty array / string for "nothing"), which
 * every consumer here already tolerates.
 */
export function geminiSchemaToJsonSchema(schema: any): any {
  if (!schema || typeof schema !== 'object') return schema;
  const rawType = typeof schema.type === 'string' ? schema.type : '';
  const type = TYPE_MAP[rawType.toUpperCase()] || rawType.toLowerCase() || undefined;
  const out: any = {};
  if (type) out.type = type;
  if (schema.description) out.description = schema.description;
  if (Array.isArray(schema.enum)) out.enum = schema.enum;
  if (type === 'object') {
    const props = schema.properties || {};
    out.properties = {};
    for (const [k, v] of Object.entries(props)) out.properties[k] = geminiSchemaToJsonSchema(v);
    out.required = Object.keys(props);
    out.additionalProperties = false;
  } else if (type === 'array') {
    out.items = schema.items ? geminiSchemaToJsonSchema(schema.items) : {};
  }
  return out;
}

// ─── OpenAI ────────────────────────────────────────────────────────────────

class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function generateOpenAI(params: GenerateParams, env: NodeJS.ProcessEnv): Promise<GenerateResult> {
  const apiKey = env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not configured on the server.');
  const model = env.OPENAI_MODEL || OPENAI_DEFAULT_MODEL;

  const wantsJson = params.config?.responseMimeType === 'application/json';
  const body: any = {
    model,
    messages: [{ role: 'user', content: params.contents }],
    // The largest response here (analyseResume) echoes the whole resume plus
    // suggestions; leave plenty of room so JSON is never cut mid-object.
    max_completion_tokens: 16000,
  };
  if (wantsJson) {
    body.response_format = params.config?.responseSchema
      ? {
          type: 'json_schema',
          json_schema: { name: 'result', strict: true, schema: geminiSchemaToJsonSchema(params.config.responseSchema) },
        }
      : { type: 'json_object' };
  }
  // GPT-5 family: keep reasoning short for latency/cost; these are extraction and
  // rewrite tasks, not maths. (They also reject non-default temperature.)
  if (/^gpt-5/.test(model)) body.reasoning_effort = env.OPENAI_REASONING_EFFORT || 'low';
  else if (typeof params.config?.temperature === 'number') body.temperature = params.config.temperature;

  const res = await fetch(`${env.OPENAI_BASE_URL || 'https://api.openai.com/v1'}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* non-JSON error */ }
    // Status is attached so the call sites' existing 429/503 retry logic applies.
    throw new HttpError(res.status, `OpenAI ${res.status}${detail ? `: ${detail}` : ''}`);
  }

  const data: any = await res.json();
  const choice = data?.choices?.[0];
  if (!choice) throw new Error('OpenAI returned no choices.');
  if (choice.message?.refusal) throw new Error(`OpenAI refused: ${choice.message.refusal}`);
  if (choice.finish_reason === 'length') throw new Error('OpenAI output was cut off (max_completion_tokens reached).');
  const text = typeof choice.message?.content === 'string' ? choice.message.content : '';
  return { text, provider: 'openai', model };
}

// ─── Gemini ────────────────────────────────────────────────────────────────

let gemini: GoogleGenAI | null = null;
async function generateGemini(params: GenerateParams, env: NodeJS.ProcessEnv): Promise<GenerateResult> {
  const apiKey = env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY is not configured on the server.');
  if (!gemini) gemini = new GoogleGenAI({ apiKey });
  const model = env.GEMINI_MODEL || params.model || GEMINI_DEFAULT_MODEL;
  const response = await gemini.models.generateContent({ ...params, model } as any);
  return { text: response.text || '', provider: 'gemini', model };
}

// ─── Entry point ───────────────────────────────────────────────────────────

export async function generateText(params: GenerateParams, env: NodeJS.ProcessEnv = process.env): Promise<GenerateResult> {
  const provider = resolveProvider(env);
  if (!provider) throw new Error(LLM_NOT_CONFIGURED);
  return provider === 'openai' ? generateOpenAI(params, env) : generateGemini(params, env);
}
