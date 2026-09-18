import { IntentType } from './types';

const KEYWORD_RULES: Array<{ intent: IntentType; patterns: RegExp[] }> = [
  {
    intent: 'opt_out',
    patterns: [
      /\b(stop|unsubscribe|remove|opt\s*out|don'?t\s*contact|leave\s*me\s*alone|quit|end|cancel\s*all)\b/i,
      /\b(stop\s*all|revoke|optout)\b/i,
    ],
  },
  {
    intent: 'pricing_question',
    patterns: [
      /\b(price|cost|how\s*much|discount|cheaper|expensive|afford|budget|quote|rate)\b/i,
      /\b(cheapest|best\s*price|lower|reduce|deal|offer)\b/i,
    ],
  },
  {
    intent: 'reschedule',
    patterns: [
      /\b(reschedule|different\s*time|another\s*day|can'?t\s*make\s*it|move\s*it|postpone|delay)\b/i,
      /\b(not\s*available|busy|conflict|push\s*back|later)\b/i,
    ],
  },
  {
    intent: 'interested',
    patterns: [
      /\b(yes|interested|book|schedule|proceed|let'?s\s*do\s*it|sign\s*up|confirm|accept|go\s*ahead)\b/i,
      /\b(set\s*up|arrange|plan|fix\s*it)\b/i,
    ],
  },
  {
    intent: 'general_question',
    patterns: [
      /\b(question|help|info|details|explain|what|how|when|where|why|who)\b/i,
      /\b(please|thanks|thank\s*you|ok|okay|got\s*it|understand)\b/i,
    ],
  },
];

export function classifyIntentDeterministic(text: string): IntentType | null {
  const normalized = text.trim().toLowerCase();

  if (normalized.length === 0) return null;

  for (const rule of KEYWORD_RULES) {
    for (const pattern of rule.patterns) {
      if (pattern.test(normalized)) {
        return rule.intent;
      }
    }
  }

  return null;
}

export function classifyIntent(text: string): IntentType {
  const deterministic = classifyIntentDeterministic(text);
  if (deterministic) return deterministic;

  return 'unknown';
}
