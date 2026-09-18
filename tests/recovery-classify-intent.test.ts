import { describe, it, expect } from 'vitest';
import { classifyIntent, classifyIntentDeterministic } from '@/lib/workers/recovery/classify-intent';

describe('classifyIntentDeterministic', () => {
  describe('opt_out intent', () => {
    it('detects "stop"', () => {
      expect(classifyIntentDeterministic('stop')).toBe('opt_out');
    });

    it('detects "unsubscribe"', () => {
      expect(classifyIntentDeterministic('unsubscribe')).toBe('opt_out');
    });

    it('detects "remove me"', () => {
      expect(classifyIntentDeterministic('remove me from your list')).toBe('opt_out');
    });

    it('detects "opt out"', () => {
      expect(classifyIntentDeterministic('I want to opt out')).toBe('opt_out');
    });

    it('detects "don\'t contact"', () => {
      expect(classifyIntentDeterministic("don't contact me anymore")).toBe('opt_out');
    });

    it('detects "stop all"', () => {
      expect(classifyIntentDeterministic('STOP ALL')).toBe('opt_out');
    });

    it('detects "quit"', () => {
      expect(classifyIntentDeterministic('quit')).toBe('opt_out');
    });

    it('detects "end"', () => {
      expect(classifyIntentDeterministic('end')).toBe('opt_out');
    });
  });

  describe('interested intent', () => {
    it('detects "yes"', () => {
      expect(classifyIntentDeterministic('yes')).toBe('interested');
    });

    it('detects "interested"', () => {
      expect(classifyIntentDeterministic('I am interested')).toBe('interested');
    });

    it('detects "book"', () => {
      expect(classifyIntentDeterministic('book it')).toBe('interested');
    });

    it('detects "schedule"', () => {
      expect(classifyIntentDeterministic('schedule the appointment')).toBe('interested');
    });

    it('detects "let\'s do it"', () => {
      expect(classifyIntentDeterministic("let's do it")).toBe('interested');
    });

    it('detects "proceed"', () => {
      expect(classifyIntentDeterministic('proceed with the estimate')).toBe('interested');
    });

    it('detects "confirm"', () => {
      expect(classifyIntentDeterministic('confirm the booking')).toBe('interested');
    });

    it('detects "go ahead"', () => {
      expect(classifyIntentDeterministic('go ahead')).toBe('interested');
    });
  });

  describe('reschedule intent', () => {
    it('detects "reschedule"', () => {
      expect(classifyIntentDeterministic('reschedule')).toBe('reschedule');
    });

    it('detects "different time"', () => {
      expect(classifyIntentDeterministic('can we do a different time')).toBe('reschedule');
    });

    it('detects "another day"', () => {
      expect(classifyIntentDeterministic('another day works better')).toBe('reschedule');
    });

    it('detects "can\'t make it"', () => {
      expect(classifyIntentDeterministic("I can't make it")).toBe('reschedule');
    });

    it('detects "postpone"', () => {
      expect(classifyIntentDeterministic('postpone the appointment')).toBe('reschedule');
    });

    it('detects "not available"', () => {
      expect(classifyIntentDeterministic('I am not available')).toBe('reschedule');
    });
  });

  describe('pricing_question intent', () => {
    it('detects "price"', () => {
      expect(classifyIntentDeterministic('what is the price')).toBe('pricing_question');
    });

    it('detects "cost"', () => {
      expect(classifyIntentDeterministic('how much does it cost')).toBe('pricing_question');
    });

    it('detects "how much"', () => {
      expect(classifyIntentDeterministic('how much')).toBe('pricing_question');
    });

    it('detects "discount"', () => {
      expect(classifyIntentDeterministic('is there a discount')).toBe('pricing_question');
    });

    it('detects "expensive"', () => {
      expect(classifyIntentDeterministic('that is too expensive')).toBe('pricing_question');
    });

    it('detects "cheaper"', () => {
      expect(classifyIntentDeterministic('can you do it cheaper')).toBe('pricing_question');
    });
  });

  describe('general_question intent', () => {
    it('detects "question"', () => {
      expect(classifyIntentDeterministic('I have a question')).toBe('general_question');
    });

    it('detects "help"', () => {
      expect(classifyIntentDeterministic('help me')).toBe('general_question');
    });

    it('detects "what"', () => {
      expect(classifyIntentDeterministic('what is included')).toBe('general_question');
    });

    it('detects "how"', () => {
      expect(classifyIntentDeterministic('how does this work')).toBe('general_question');
    });

    it('detects "thanks"', () => {
      expect(classifyIntentDeterministic('thank you')).toBe('general_question');
    });
  });

  describe('unknown intent', () => {
    it('returns null for empty string', () => {
      expect(classifyIntentDeterministic('')).toBeNull();
    });

    it('returns null for ambiguous text', () => {
      expect(classifyIntentDeterministic('asdfghjkl')).toBeNull();
    });
  });
});

describe('classifyIntent', () => {
  it('returns deterministic result when available', () => {
    expect(classifyIntent('stop')).toBe('opt_out');
    expect(classifyIntent('yes')).toBe('interested');
    expect(classifyIntent('reschedule')).toBe('reschedule');
    expect(classifyIntent('price')).toBe('pricing_question');
    expect(classifyIntent('help')).toBe('general_question');
  });

  it('returns unknown for empty string', () => {
    expect(classifyIntent('')).toBe('unknown');
  });

  it('returns unknown for ambiguous text', () => {
    expect(classifyIntent('asdfghjkl')).toBe('unknown');
  });

  it('handles mixed case', () => {
    expect(classifyIntent('STOP')).toBe('opt_out');
    expect(classifyIntent('YES')).toBe('interested');
    expect(classifyIntent('RESCHEDULE')).toBe('reschedule');
  });

  it('handles phrases with keywords', () => {
    expect(classifyIntent('I want to stop receiving messages')).toBe('opt_out');
    expect(classifyIntent('I would like to schedule an appointment')).toBe('interested');
    expect(classifyIntent('Can we reschedule for next week')).toBe('reschedule');
    expect(classifyIntent('What is the price for this service')).toBe('pricing_question');
  });
});
