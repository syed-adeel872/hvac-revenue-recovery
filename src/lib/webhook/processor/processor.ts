import { ProcessorConfig, DEFAULT_PROCESSOR_CONFIG, ClaimedEvent, ProcessResult } from './types';
import { claimEvents } from './claim-events';
import { processEvent } from './process-event';

export interface ProcessBatchResult {
  total: number;
  succeeded: number;
  failed: number;
  retried: number;
  results: ProcessResult[];
}

export interface ProcessorLoopOptions {
  supabase: any;
  config?: Partial<ProcessorConfig>;
  onBatchComplete?: (result: ProcessBatchResult) => void;
  shouldStop?: () => boolean;
}

async function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function processPendingEvents(options: ProcessorLoopOptions): Promise<ProcessBatchResult> {
  const { supabase, config, onBatchComplete, shouldStop } = options;
  const cfg = { ...DEFAULT_PROCESSOR_CONFIG, ...config };

  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;
  let totalRetried = 0;
  const allResults: ProcessResult[] = [];

  while (true) {
    if (shouldStop && shouldStop()) {
      break;
    }

    const claimedEvents = await claimEvents({ supabase, config: cfg });

    if (claimedEvents.length === 0) {
      if (cfg.pollIntervalMs <= 0) {
        break;
      }
      await delay(cfg.pollIntervalMs);
      continue;
    }

    const batchResults: ProcessResult[] = [];

    for (const event of claimedEvents) {
      const result = await processEvent({
        supabase,
        event,
        maxRetries: cfg.maxRetries,
      });

      batchResults.push(result);
      allResults.push(result);

      if (result.success) {
        totalSucceeded++;
      } else if (result.shouldRetry) {
        totalRetried++;
      } else {
        totalFailed++;
      }
      totalProcessed++;
    }

    const batchResult: ProcessBatchResult = {
      total: claimedEvents.length,
      succeeded: batchResults.filter((r) => r.success).length,
      failed: batchResults.filter((r) => !r.success && !r.shouldRetry).length,
      retried: batchResults.filter((r) => r.shouldRetry).length,
      results: batchResults,
    };

    if (onBatchComplete) {
      onBatchComplete(batchResult);
    }

    if (cfg.pollIntervalMs > 0) {
      await delay(cfg.pollIntervalMs);
    } else {
      break;
    }
  }

  return {
    total: totalProcessed,
    succeeded: totalSucceeded,
    failed: totalFailed,
    retried: totalRetried,
    results: allResults,
  };
}

export async function processBatchOnce(options: {
  supabase: any;
  config?: Partial<ProcessorConfig>;
}): Promise<ProcessBatchResult> {
  const { supabase, config } = options;
  const cfg = { ...DEFAULT_PROCESSOR_CONFIG, ...config };

  const claimedEvents = await claimEvents({ supabase, config: cfg });

  if (claimedEvents.length === 0) {
    return {
      total: 0,
      succeeded: 0,
      failed: 0,
      retried: 0,
      results: [],
    };
  }

  const batchResults: ProcessResult[] = [];

  for (const event of claimedEvents) {
    const result = await processEvent({
      supabase,
      event,
      maxRetries: cfg.maxRetries,
    });
    batchResults.push(result);
  }

  return {
    total: claimedEvents.length,
    succeeded: batchResults.filter((r) => r.success).length,
    failed: batchResults.filter((r) => !r.success && !r.shouldRetry).length,
    retried: batchResults.filter((r) => r.shouldRetry).length,
    results: batchResults,
  };
}