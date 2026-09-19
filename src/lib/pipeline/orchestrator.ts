import { SupabaseClient } from '@supabase/supabase-js';
import { processBatchOnce } from '@/lib/webhook/processor';
import { processBatch as processIntelligenceBatch } from '@/lib/workers/intelligence/engine';
import { processBatch as processRecoveryBatch, processInboundMessages } from '@/lib/workers/recovery/engine';
import { processBatch as processExecutionBatch, resetTenantCircuitBreakers } from '@/lib/workers/execution/engine';
import { processBatch as processOperationsBatch } from '@/lib/workers/operations/engine';
import { MockMessagingAdapter, MessagingAdapter } from '@/lib/workers/execution/adapters';
import { createMessagingAdapter } from '@/lib/messaging';
import { checkKillSwitch } from '@/lib/safety/resilience/kill-switch';

export interface PipelineStageResult {
  stage: string;
  success: boolean;
  total: number;
  succeeded: number;
  failed: number;
  rejected?: number;
  error?: string;
}

export interface PipelineResult {
  clientId: string;
  success: boolean;
  stages: PipelineStageResult[];
  startedAt: string;
  completedAt: string;
}

export interface RunPipelineOptions {
  supabase: SupabaseClient;
  clientId: string;
  batchSize?: number;
  adapter?: MessagingAdapter;
  skipStages?: string[];
}

export async function runPipeline(options: RunPipelineOptions): Promise<PipelineResult> {
  const {
    supabase,
    clientId,
    batchSize = 10,
    adapter = createMessagingAdapter(),
    skipStages = [],
  } = options;

  const startedAt = new Date().toISOString();
  const stages: PipelineStageResult[] = [];
  let pipelineSuccess = true;

  const killSwitch = await checkKillSwitch(supabase, clientId);
  if (killSwitch.enabled) {
    return {
      clientId,
      success: false,
      stages: [{
        stage: 'kill_switch',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: killSwitch.reason ?? 'Kill switch activated',
      }],
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }

  if (!skipStages.includes('ingestion')) {
    try {
      const result = await processBatchOnce({
        supabase,
        config: { batchSize, pollIntervalMs: 0 },
      });
      stages.push({
        stage: 'ingestion',
        success: result.failed === 0,
        total: result.total,
        succeeded: result.succeeded,
        failed: result.failed,
      });
      if (result.failed > 0) pipelineSuccess = false;
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'ingestion',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  if (!skipStages.includes('inbound')) {
    try {
      const interStageKillSwitch = await checkKillSwitch(supabase, clientId);
      if (interStageKillSwitch.enabled) {
        stages.push({
          stage: 'inbound',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: interStageKillSwitch.reason ?? 'Kill switch activated between stages',
        });
        pipelineSuccess = false;
      } else {
        const result = await processInboundMessages({ supabase, clientId, batchSize });
        stages.push({
          stage: 'inbound',
          success: result.failed === 0,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        });
        if (result.failed > 0) pipelineSuccess = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'inbound',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  if (!skipStages.includes('intelligence')) {
    try {
      const interStageKillSwitch = await checkKillSwitch(supabase, clientId);
      if (interStageKillSwitch.enabled) {
        stages.push({
          stage: 'intelligence',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: interStageKillSwitch.reason ?? 'Kill switch activated between stages',
        });
        pipelineSuccess = false;
      } else {
        const result = await processIntelligenceBatch({ supabase, clientId, batchSize });
        stages.push({
          stage: 'intelligence',
          success: result.failed === 0,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        });
        if (result.failed > 0) pipelineSuccess = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'intelligence',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  if (!skipStages.includes('recovery')) {
    try {
      const interStageKillSwitch = await checkKillSwitch(supabase, clientId);
      if (interStageKillSwitch.enabled) {
        stages.push({
          stage: 'recovery',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: interStageKillSwitch.reason ?? 'Kill switch activated between stages',
        });
        pipelineSuccess = false;
      } else {
        const result = await processRecoveryBatch({ supabase, clientId, batchSize });
        stages.push({
          stage: 'recovery',
          success: result.failed === 0,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        });
        if (result.failed > 0) pipelineSuccess = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'recovery',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  if (!skipStages.includes('execution')) {
    try {
      const interStageKillSwitch = await checkKillSwitch(supabase, clientId);
      if (interStageKillSwitch.enabled) {
        stages.push({
          stage: 'execution',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: interStageKillSwitch.reason ?? 'Kill switch activated between stages',
        });
        pipelineSuccess = false;
      } else {
        const result = await processExecutionBatch(supabase, clientId, adapter, { batchSize });
        stages.push({
          stage: 'execution',
          success: result.failed === 0 && result.rejected === 0,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
          rejected: result.rejected,
        });
        if (result.failed > 0 || result.rejected > 0) pipelineSuccess = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'execution',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  if (!skipStages.includes('operations')) {
    try {
      const interStageKillSwitch = await checkKillSwitch(supabase, clientId);
      if (interStageKillSwitch.enabled) {
        stages.push({
          stage: 'operations',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: interStageKillSwitch.reason ?? 'Kill switch activated between stages',
        });
        pipelineSuccess = false;
      } else {
        const result = await processOperationsBatch(supabase, [clientId]);
        stages.push({
          stage: 'operations',
          success: result.failed === 0,
          total: result.total,
          succeeded: result.succeeded,
          failed: result.failed,
        });
        if (result.failed > 0) pipelineSuccess = false;
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      stages.push({
        stage: 'operations',
        success: false,
        total: 0,
        succeeded: 0,
        failed: 0,
        error: msg,
      });
      pipelineSuccess = false;
    }
  }

  return {
    clientId,
    success: pipelineSuccess,
    stages,
    startedAt,
    completedAt: new Date().toISOString(),
  };
}

export interface RunMultiTenantPipelineOptions {
  supabase: SupabaseClient;
  clientIds: string[];
  batchSize?: number;
  adapter?: MessagingAdapter;
  skipStages?: string[];
}

export async function runMultiTenantPipeline(
  options: RunMultiTenantPipelineOptions,
): Promise<PipelineResult[]> {
  const { supabase, clientIds, batchSize, adapter, skipStages } = options;

  resetTenantCircuitBreakers();

  const results: PipelineResult[] = [];

  for (const clientId of clientIds) {
    try {
      const result = await runPipeline({
        supabase,
        clientId,
        batchSize,
        adapter,
        skipStages,
      });
      results.push(result);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown pipeline error';
      results.push({
        clientId,
        success: false,
        stages: [{
          stage: 'pipeline_error',
          success: false,
          total: 0,
          succeeded: 0,
          failed: 0,
          error: errorMsg,
        }],
        startedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
      });
    }
  }

  return results;
}
