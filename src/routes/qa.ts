/**
 * QA Routes
 * QA関連のエンドポイント
 *
 * POST /qa/check - コンテンツのNG表現チェック
 * POST /qa/smoke-test - スモークテストジョブ投入
 * GET /qa/smoke-test/:jobId - スモークテスト結果取得
 * POST /qa/smoke-test/:jobId/result - スモークテスト結果受信（外部ランナー用Webhook）
 */

import { Hono } from 'hono';
import type { Env } from '../types/env.js';
import type {
  NgRules,
  QaCheckRequest,
  SmokeTestRequest,
  SmokeTestResult,
  SmokeTestJob,
  EvidenceInfo,
} from '../types/qa.js';
import { authMiddleware, type AuthVariables } from '../middleware/auth.js';
import { requirePermission } from '../middleware/rbac.js';
import { createQaService } from '../services/qa/index.js';
import { ngRulesValidator } from '../services/qa/index.js';
import { createD1Repositories } from '../repositories/factory.js';
import ulid from '../lib/ulid.js';

type QaEnv = {
  Bindings: Env;
  Variables: AuthVariables;
};

/**
 * POST /qa/check リクエストボディ
 */
interface CheckRequestBody {
  /** チェック対象テキスト */
  text: string;
  /** プロジェクトID（NGルール取得用） */
  projectId?: string;
  /** カスタムNGルール（直接指定） */
  ngRules?: NgRules;
  /** エビデンス情報 */
  evidence?: EvidenceInfo[];
}

/**
 * POST /qa/smoke-test リクエストボディ
 */
interface SmokeTestRequestBody {
  /** Run ID */
  runId: string;
  /** LP Variant ID（省略時は全バリアント） */
  lpVariantId?: string;
  /** テスト設定 */
  config?: {
    timeoutMs?: number;
    ctaSelector?: string;
    formSelector?: string;
    additionalChecks?: string[];
  };
}

/**
 * POST /qa/smoke-test/:jobId/result リクエストボディ（外部ランナーからのWebhook）
 */
interface SmokeTestResultBody {
  /** テスト成功フラグ */
  passed: boolean;
  /** 個別チェック結果 */
  checks: {
    name: string;
    passed: boolean;
    message: string;
    details?: Record<string, unknown>;
  }[];
  /** エラー */
  error?: string;
  /** 実行時間（ミリ秒） */
  durationMs?: number;
  /** スクリーンショットR2キー */
  screenshotR2Key?: string;
}

/**
 * Create QA routes
 */
export function createQaRoutes() {
  const qa = new Hono<QaEnv>();

  // Apply auth middleware to all routes
  qa.use('*', authMiddleware());

  /**
   * POST /qa/check - コンテンツのNG表現チェック
   *
   * NG表現チェックを実行し、blockers/warningsを返す
   */
  qa.post('/check', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: CheckRequestBody;
    try {
      body = await c.req.json<CheckRequestBody>();
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Invalid JSON body',
        },
        400
      );
    }

    // Validate required fields
    if (!body.text || typeof body.text !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'text is required and must be a string',
        },
        400
      );
    }

    // NGルールを取得
    let ngRules: NgRules | undefined = body.ngRules;

    // プロジェクトIDが指定されている場合、プロジェクトからNGルールを取得
    if (body.projectId && !ngRules) {
      const project = await repos.project.findById(body.projectId);
      if (!project) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Project not found',
          },
          404
        );
      }

      // テナント所属チェック
      if (project.tenantId !== authContext.tenantId) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'Project not found',
          },
          404
        );
      }

      // プロジェクトのNGルールをパース
      if (project.ngRulesJson) {
        try {
          const parsed = JSON.parse(project.ngRulesJson);
          const validationResult = ngRulesValidator.validate(parsed);
          if (validationResult.valid) {
            ngRules = parsed as NgRules;
          }
        } catch {
          // パース失敗時はデフォルトルールを使用
        }
      }
    }

    // カスタムNGルールが指定されている場合、スキーマ検証
    if (body.ngRules) {
      const validationResult = ngRulesValidator.validate(body.ngRules);
      if (!validationResult.valid) {
        return c.json(
          {
            status: 'error',
            error: 'invalid_ng_rules',
            message: 'Invalid NG rules schema',
            details: validationResult.errors,
          },
          400
        );
      }
    }

    // QAサービスでチェック実行
    const qaService = createQaService({ defaultNgRules: ngRules });
    const result = qaService.check({
      text: body.text,
      ngRules,
      evidence: body.evidence,
    });

    return c.json({
      status: 'ok',
      data: {
        passed: result.passed,
        blockers: result.blockers,
        warnings: result.warnings,
        checkedText: result.checkedText,
        rulesVersion: result.rulesVersion,
        timestamp: result.timestamp,
      },
    });
  });

  /**
   * POST /qa/smoke-test - スモークテストジョブ投入
   *
   * 外部ランナー（Playwright）でテストを実行するためのジョブを作成
   * ジョブはQueueに投入され、結果はWebhookで受け取る
   */
  qa.post('/smoke-test', requirePermission('run', 'update'), async (c) => {
    const authContext = c.get('auth');
    const repos = createD1Repositories(c.env.DB);

    // Parse request body
    let body: SmokeTestRequestBody;
    try {
      body = await c.req.json<SmokeTestRequestBody>();
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Invalid JSON body',
        },
        400
      );
    }

    // Validate required fields
    if (!body.runId || typeof body.runId !== 'string') {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'runId is required',
        },
        400
      );
    }

    // Runの存在確認
    const run = await repos.run.findById(body.runId);
    if (!run) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // Run所属プロジェクトのテナントチェック
    const project = await repos.project.findById(run.projectId);
    if (!project || project.tenantId !== authContext.tenantId) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Run not found',
        },
        404
      );
    }

    // LP Variantが指定されている場合、存在確認
    if (body.lpVariantId) {
      const lpVariant = await repos.lpVariant.findById(body.lpVariantId);
      if (!lpVariant) {
        return c.json(
          {
            status: 'error',
            error: 'not_found',
            message: 'LP Variant not found',
          },
          404
        );
      }
    }

    // QAサービスでジョブ作成
    const qaService = createQaService();
    const job = qaService.createSmokeTestJob(authContext.tenantId, {
      runId: body.runId,
      lpVariantId: body.lpVariantId,
      config: body.config,
    });

    // ジョブをDBに保存（jobsテーブル使用）
    const now = new Date().toISOString();
    await c.env.DB.prepare(
      `INSERT INTO jobs (id, tenant_id, job_type, status, payload_json, result_json, attempts, max_attempts, last_error, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        job.id,
        authContext.tenantId,
        'qa_smoke',
        'queued',
        JSON.stringify({
          runId: job.runId,
          lpVariantId: job.lpVariantId,
          config: job.config,
        }),
        '{}',
        0,
        3,
        '',
        now,
        now
      )
      .run();

    // Queueにジョブを投入
    await c.env.TASK_QUEUE.send({
      type: 'qa_smoke_test',
      payload: {
        jobId: job.id,
        tenantId: authContext.tenantId,
        runId: job.runId,
        lpVariantId: job.lpVariantId,
        config: job.config,
      },
      timestamp: now,
    });

    return c.json(
      {
        status: 'ok',
        data: {
          jobId: job.id,
          runId: job.runId,
          lpVariantId: job.lpVariantId,
          status: job.status,
          config: job.config,
          defaultChecks: qaService.getDefaultSmokeTestChecks(),
          createdAt: job.createdAt,
        },
      },
      201
    );
  });

  /**
   * GET /qa/smoke-test/:jobId - スモークテスト結果取得
   *
   * ジョブの現在のステータスと結果を取得
   */
  qa.get('/smoke-test/:jobId', requirePermission('run', 'read'), async (c) => {
    const authContext = c.get('auth');
    const jobId = c.req.param('jobId');

    // ジョブを取得
    const result = await c.env.DB.prepare(
      `SELECT id, tenant_id, job_type, status, payload_json, result_json, attempts, last_error, created_at, updated_at
       FROM jobs
       WHERE id = ? AND tenant_id = ? AND job_type = ?`
    )
      .bind(jobId, authContext.tenantId, 'qa_smoke')
      .first();

    if (!result) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Smoke test job not found',
        },
        404
      );
    }

    // ペイロードと結果をパース
    let payload: Record<string, unknown> = {};
    let jobResult: SmokeTestResult | null = null;

    try {
      payload = JSON.parse(result.payload_json as string);
    } catch {
      // パース失敗時は空オブジェクト
    }

    try {
      const parsedResult = JSON.parse(result.result_json as string);
      if (parsedResult && Object.keys(parsedResult).length > 0) {
        jobResult = parsedResult as SmokeTestResult;
      }
    } catch {
      // パース失敗時はnull
    }

    // レスポンス構築
    const job: SmokeTestJob = {
      id: result.id as string,
      tenantId: result.tenant_id as string,
      runId: payload.runId as string,
      lpVariantId: payload.lpVariantId as string | undefined,
      status: result.status as SmokeTestJob['status'],
      config: (payload.config as SmokeTestJob['config']) ?? {},
      createdAt: result.created_at as string,
      updatedAt: result.updated_at as string,
      result: jobResult ?? undefined,
    };

    return c.json({
      status: 'ok',
      data: job,
    });
  });

  /**
   * POST /qa/smoke-test/:jobId/result - スモークテスト結果受信（外部ランナー用Webhook）
   *
   * 外部ランナーからテスト結果を受け取り、ジョブを更新
   * Note: 実際の運用ではWebhook認証が必要
   */
  qa.post('/smoke-test/:jobId/result', async (c) => {
    const jobId = c.req.param('jobId');

    // Parse request body
    let body: SmokeTestResultBody;
    try {
      body = await c.req.json<SmokeTestResultBody>();
    } catch {
      return c.json(
        {
          status: 'error',
          error: 'invalid_request',
          message: 'Invalid JSON body',
        },
        400
      );
    }

    // ジョブの存在確認
    const existingJob = await c.env.DB.prepare(
      `SELECT id, tenant_id, status FROM jobs WHERE id = ? AND job_type = ?`
    )
      .bind(jobId, 'qa_smoke')
      .first();

    if (!existingJob) {
      return c.json(
        {
          status: 'error',
          error: 'not_found',
          message: 'Smoke test job not found',
        },
        404
      );
    }

    // 結果を整形
    const qaService = createQaService();
    const result = qaService.createSmokeTestResult(
      body.checks,
      body.error,
      body.durationMs,
      body.screenshotR2Key
    );

    // ジョブを更新
    const newStatus = result.passed ? 'succeeded' : 'failed';
    const now = new Date().toISOString();

    await c.env.DB.prepare(
      `UPDATE jobs
       SET status = ?, result_json = ?, last_error = ?, updated_at = ?
       WHERE id = ?`
    )
      .bind(
        newStatus,
        JSON.stringify(result),
        body.error ?? '',
        now,
        jobId
      )
      .run();

    return c.json({
      status: 'ok',
      data: {
        jobId,
        newStatus,
        passed: result.passed,
        updatedAt: now,
      },
    });
  });

  return qa;
}

export const qaRoutes = createQaRoutes();
