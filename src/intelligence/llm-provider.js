/**
 * LLM Provider — unified wrapper for Groq, OpenAI, and Anthropic.
 *
 * Priority order (first key found wins as primary):
 *   1. GROQ_API_KEY      → llama-3.3-70b-versatile  (free tier, very fast)
 *   2. OPENAI_API_KEY    → gpt-4o-mini
 *   3. ANTHROPIC_API_KEY → claude-3-haiku-20240307
 *
 * All configured providers are kept alive. If the primary returns a
 * quota/rate-limit error (429), the request is transparently retried
 * on the next available provider — no changes needed in calling code.
 */

import OpenAI from 'openai';          // also used by Groq (compatible API)
import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

// Errors that mean "try the next provider"
function isQuotaError(err) {
  if (!err) return false;
  const status = err.status ?? err.statusCode;
  // 401 = bad/expired key, 429 = rate limit, 400 = credit error
  if (status === 401 || status === 429 || status === 400) return true;
  if (/quota|rate.?limit|credit balance|insufficient|incorrect api key|invalid.*key/i.test(err.message ?? '')) return true;
  return false;
}

export class LLMProvider {
  constructor() {
    // Build a list of available providers in priority order
    this._providers = [];

    if (process.env.GROQ_API_KEY) {
      this._providers.push({
        name: 'Groq',
        model: 'llama-3.3-70b-versatile',
        client: new Groq({ apiKey: process.env.GROQ_API_KEY }),
        type: 'openai-compat'   // Groq uses the OpenAI chat format
      });
    }

    if (process.env.OPENAI_API_KEY) {
      this._providers.push({
        name: 'OpenAI',
        model: 'gpt-4o-mini',
        client: new OpenAI({ apiKey: process.env.OPENAI_API_KEY }),
        type: 'openai-compat'
      });
    }

    if (process.env.ANTHROPIC_API_KEY) {
      this._providers.push({
        name: 'Anthropic',
        model: 'claude-3-haiku-20240307',
        client: new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY }),
        type: 'anthropic'
      });
    }

    if (this._providers.length === 0) {
      console.warn('⚠️  No LLM API key found — will fall back to rule-based extraction');
    } else {
      const primary = this._providers[0];
      const fallbacks = this._providers.slice(1).map(p => `${p.name}`).join(' → ');
      const fb = fallbacks ? `  (fallback: ${fallbacks})` : '';
      console.log(`🤖 LLM: ${primary.name} ${primary.model}${fb}`);
    }
  }

  get isAvailable() {
    return this._providers.length > 0;
  }

  /**
   * Send a completion. Walks through providers until one succeeds.
   */
  async complete(systemPrompt, userPrompt, opts = {}) {
    if (!this.isAvailable) throw new Error('No LLM provider configured');

    let lastError;
    for (const provider of this._providers) {
      try {
        return await this._callProvider(provider, systemPrompt, userPrompt, opts);
      } catch (err) {
        if (isQuotaError(err)) {
          const next = this._providers[this._providers.indexOf(provider) + 1];
          console.warn(`⚠️  ${provider.name} quota/limit hit${next ? ` — retrying with ${next.name}...` : ' — no more providers'}`);
          lastError = err;
          continue;
        }
        throw err; // non-quota error: surface immediately
      }
    }
    throw lastError;
  }

  async _callProvider(provider, systemPrompt, userPrompt, opts) {
    const maxTokens = opts.maxTokens ?? 1024;
    const temperature = opts.temperature ?? 0.2;

    if (provider.type === 'openai-compat') {
      const res = await provider.client.chat.completions.create({
        model: provider.model,
        temperature,
        max_tokens: maxTokens,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ]
      });
      return res.choices[0].message.content.trim();
    }

    if (provider.type === 'anthropic') {
      const res = await provider.client.messages.create({
        model: provider.model,
        max_tokens: maxTokens,
        temperature,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      });
      return res.content[0].text.trim();
    }

    throw new Error(`Unknown provider type: ${provider.type}`);
  }

  /**
   * Complete and parse as JSON. Retries once on JSON parse failure.
   * Provider fallback is handled transparently inside complete().
   */
  async completeJSON(systemPrompt, userPrompt, opts = {}) {
    const raw = await this.complete(systemPrompt, userPrompt, opts);
    const cleaned = raw.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();

    try {
      return JSON.parse(cleaned);
    } catch {
      const retryPrompt = `${userPrompt}\n\nREMINDER: Respond ONLY with valid JSON, no markdown, no explanation.`;
      const raw2 = await this.complete(systemPrompt, retryPrompt, opts);
      const cleaned2 = raw2.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/, '').trim();
      return JSON.parse(cleaned2);
    }
  }
}

/** Singleton — one provider per process */
let _instance = null;
export function getLLMProvider() {
  if (!_instance) _instance = new LLMProvider();
  return _instance;
}
