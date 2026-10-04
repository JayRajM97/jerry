// Provider layer, offline: schema translation must produce strict JSON Schema,
// provider selection must follow the env, and the OpenAI request/response
// handling must be right — checked against a mocked endpoint, no key needed.
import { Type } from '@google/genai';
import { geminiSchemaToJsonSchema, resolveProvider, llmStatus, generateText } from '../../server/llm.ts';

let pass = 0, total = 0;
const check = (name: string, ok: boolean, detail?: string) => { total++; if (ok) pass++; console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${!ok && detail ? '  ' + detail : ''}`); };

// 1. Schema translation — the analyseResume shape (nested objects, arrays, enums).
{
  const gemini = {
    type: Type.OBJECT,
    properties: {
      sections: { type: Type.ARRAY, items: { type: Type.OBJECT, properties: { id: { type: Type.STRING }, title: { type: Type.STRING } }, required: ['id'] } },
      score: { type: Type.NUMBER },
      ok: { type: Type.BOOLEAN },
      mode: { type: Type.STRING, enum: ['safe', 'needs_confirmation'] },
      count: { type: Type.INTEGER },
    },
    required: ['sections'],
  };
  const js = geminiSchemaToJsonSchema(gemini);
  check('types lowercased', js.type === 'object' && js.properties.score.type === 'number' && js.properties.ok.type === 'boolean' && js.properties.count.type === 'integer');
  check('all properties required (strict mode)', JSON.stringify(js.required) === JSON.stringify(['sections', 'score', 'ok', 'mode', 'count']));
  check('additionalProperties false at every object', js.additionalProperties === false && js.properties.sections.items.additionalProperties === false);
  check('nested array item required list complete', JSON.stringify(js.properties.sections.items.required) === JSON.stringify(['id', 'title']));
  check('enum preserved', JSON.stringify(js.properties.mode.enum) === JSON.stringify(['safe', 'needs_confirmation']));
  check('no Gemini-only keys leak', !JSON.stringify(js).includes('OBJECT'));
}

// 2. Provider selection.
{
  check('nothing set → null', resolveProvider({}) === null);
  check('openai key → openai', resolveProvider({ OPENAI_API_KEY: 'x' }) === 'openai');
  check('gemini key → gemini', resolveProvider({ GEMINI_API_KEY: 'y' }) === 'gemini');
  check('both → openai', resolveProvider({ OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'y' }) === 'openai');
  check('LLM_PROVIDER overrides', resolveProvider({ OPENAI_API_KEY: 'x', GEMINI_API_KEY: 'y', LLM_PROVIDER: 'gemini' }) === 'gemini');
  const st = llmStatus({ OPENAI_API_KEY: 'x' });
  check('status reports default model', st.provider === 'openai' && st.model === 'gpt-5-mini' && st.configured);
  check('status honours OPENAI_MODEL', llmStatus({ OPENAI_API_KEY: 'x', OPENAI_MODEL: 'gpt-5-nano' }).model === 'gpt-5-nano');
}

// 3. OpenAI request shape and response parsing, against a mocked fetch.
{
  const seen: any[] = [];
  const realFetch = globalThis.fetch;
  const env = { OPENAI_API_KEY: 'sk-test', OPENAI_MODEL: 'gpt-5-mini', OPENAI_BASE_URL: 'https://mock.local/v1' } as any;

  const mock = (status: number, payload: any) => {
    globalThis.fetch = (async (url: any, init: any) => {
      seen.push({ url: String(url), init, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });
    }) as any;
  };

  mock(200, { choices: [{ finish_reason: 'stop', message: { content: '{"answers":[{"name":"q","value":"v","kind":"text"}]}' } }] });
  const out = await generateText({
    model: 'gemini-3-flash-preview',
    contents: 'hello',
    config: { responseMimeType: 'application/json', responseSchema: { type: Type.OBJECT, properties: { answers: { type: Type.ARRAY, items: { type: Type.STRING } } } } },
  }, env);
  const req = seen[0];
  check('posts to chat/completions with bearer', req.url === 'https://mock.local/v1/chat/completions' && req.init.headers.Authorization === 'Bearer sk-test');
  check('uses OPENAI_MODEL, not the gemini name', req.body.model === 'gpt-5-mini');
  check('prompt becomes the user message', req.body.messages?.[0]?.role === 'user' && req.body.messages[0].content === 'hello');
  check('strict json_schema response_format', req.body.response_format?.type === 'json_schema' && req.body.response_format.json_schema.strict === true && req.body.response_format.json_schema.schema.additionalProperties === false);
  check('gpt-5: reasoning_effort low, no temperature', req.body.reasoning_effort === 'low' && !('temperature' in req.body));
  check('text returned from message.content', out.text.includes('"answers"') && out.provider === 'openai');

  // Plain-text call (no schema) → no response_format.
  mock(200, { choices: [{ finish_reason: 'stop', message: { content: 'A short message.' } }] });
  const plain = await generateText({ contents: 'write', config: {} }, env);
  check('no schema → no response_format', !('response_format' in seen[1].body) && plain.text === 'A short message.');

  // 429 → error carries status so the call sites' retry logic can see it.
  mock(429, { error: { message: 'Rate limit reached' } });
  let status = 0, msg = '';
  try { await generateText({ contents: 'x' }, env); } catch (e: any) { status = e.status; msg = e.message; }
  check('HTTP error exposes status + message', status === 429 && msg.includes('Rate limit reached'));

  // Truncated output is an error, not silently broken JSON.
  mock(200, { choices: [{ finish_reason: 'length', message: { content: '{"partial":' } }] });
  let cut = '';
  try { await generateText({ contents: 'x' }, env); } catch (e: any) { cut = e.message; }
  check('finish_reason=length raises', /cut off/.test(cut));

  globalThis.fetch = realFetch;
}

console.log(`\n${pass}/${total} passed`);
process.exit(pass === total ? 0 : 1);
