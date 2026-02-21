/**
 * Prompts used to extract structured engineering decisions from GitHub events.
 */

export const DECISION_SYSTEM_PROMPT = `You are an expert engineering decision analyst.
Your task is to read a GitHub event (PR, commit, comment, or review) and extract any engineering decision
recorded in it.

Return a JSON object with EXACTLY these fields (use null for anything not found):

{
  "is_decision": true | false,
  "decision_statement": "One crisp sentence stating what was decided.",
  "rationale": "Why this decision was made (can be null).",
  "alternatives_considered": "Other options that were mentioned or evaluated (can be null).",
  "tradeoffs": "Explicit trade-offs discussed (can be null).",
  "problem_statement": "The problem or need that drove this decision (can be null).",
  "success_criteria": "How success is measured (can be null).",
  "implementation_notes": "Notable implementation details (can be null).",
  "decision_type": "technical" | "architectural" | "process" | "tool_choice" | "approval" | "implementation",
  "scope": "local" | "component" | "system" | "organization",
  "reversibility": "reversible" | "costly" | "irreversible",
  "decision_confidence": "high" | "medium" | "low",
  "extraction_confidence": 0.0 to 1.0
}

Rules:
- Set is_decision to false if the content contains no decision at all.
- decision_statement must be in the past tense and start with a verb, e.g. "Chose X over Y because Z".
- Keep every field concise (≤2 sentences).
- Respond ONLY with the JSON object, no markdown, no extra text.`;

/**
 * Build the user prompt for a single GitHub event.
 */
export function buildDecisionExtractionPrompt(event) {
    const eventType = event.event_type || event.type || 'unknown';
    const title = event.title || '';
    const content = event.content || event.data?.body || event.data?.message || '';
    const author = event.author_login || event.data?.author || 'unknown';
    const indicators = (event.decision_indicators || []).map(i => i.type).join(', ');
    const prNumber = event.pull_request_number || event.data?.number || null;

    return `EVENT TYPE: ${eventType}
AUTHOR: ${author}
${prNumber ? `PR NUMBER: #${prNumber}` : ''}
${title ? `TITLE: ${title}` : ''}
${indicators ? `DECISION SIGNALS DETECTED: ${indicators}` : ''}

CONTENT:
${content.substring(0, 3000)}`;
}

/* ------------------------------------------------------------------ */
/*  Why-Engine / component explanation prompts                          */
/* ------------------------------------------------------------------ */

export const WHY_SYSTEM_PROMPT = `You are a senior software engineer explaining your team's engineering decisions to a new team member.
Given a list of structured decisions and related GitHub activity for a code component, produce a concise, helpful natural-language explanation.

Return a JSON object:
{
  "summary": "2-4 sentence paragraph explaining why the component exists and how it evolved.",
  "key_decisions": ["bullet", "bullet", ...],   // up to 5 most important decisions
  "open_questions": ["...", ...]                  // unresolved or unclear areas (can be empty)
}

Be factual. If evidence is sparse, say so honestly. Respond ONLY with the JSON.`;

export function buildWhySummaryPrompt(componentName, decisions, events) {
    const decisionText = decisions.slice(0, 10).map(d =>
        `- [${d.decision_type ?? 'decision'}] ${d.decision_statement}` +
        (d.rationale ? ` (rationale: ${d.rationale})` : '')
    ).join('\n');

    const eventSummary = events.slice(0, 10).map(e =>
        `- [${e.type}] ${e.data?.title || e.data?.message?.split('\n')[0] || '(no title)'} by ${e.data?.author || 'unknown'}`
    ).join('\n');

    return `COMPONENT: ${componentName}

EXTRACTED DECISIONS (${decisions.length} total, showing top 10):
${decisionText || 'None found.'}

RELATED GITHUB ACTIVITY (${events.length} total, showing top 10):
${eventSummary || 'None found.'}`;
}
