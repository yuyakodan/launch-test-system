/**
 * Publish Service
 * Handles publishing workflow for runs including:
 * - URL generation for LP variants
 * - UTM string generation based on run_design.utm_policy
 * - Snapshot saving to R2
 * - Ad Bundle generation (LP + Creative + Copy combinations)
 */

import { ulid } from '../lib/ulid.js';
import type { Run, LpVariant, CreativeVariant, AdCopy, Intent, Deployment, AdBundle } from '../types/entities.js';
import type { Repositories } from '../repositories/factory.js';
import type { CreateAdBundleInput, CreateDeploymentInput } from '../repositories/interfaces/index.js';

/**
 * UTM Policy configuration from run_design_json
 */
export interface UtmPolicy {
  source: string;
  medium: string;
  campaign_key: string;
  content_key: string;
}

/**
 * Run design JSON structure
 */
export interface RunDesign {
  version: string;
  operation_mode?: string;
  utm_policy: UtmPolicy;
  kpi?: {
    primary: string;
    secondary?: string[];
  };
  budget?: {
    currency: string;
    total_cap: number;
    daily_cap?: number;
  };
  [key: string]: unknown;
}

/**
 * URL configuration for deployment
 */
export interface DeploymentUrls {
  baseUrl: string;
  lpUrls: Record<string, string>; // lpVariantId -> URL
}

/**
 * Snapshot manifest structure
 */
export interface SnapshotManifest {
  version: string;
  runId: string;
  deploymentId: string;
  timestamp: string;
  intents: {
    id: string;
    title: string;
    lpVariants: {
      id: string;
      version: number;
      blocksJson: string;
      themeJson: string;
    }[];
    creativeVariants: {
      id: string;
      size: string;
      version: number;
      imageR2Key: string;
      textLayersJson: string;
    }[];
    adCopies: {
      id: string;
      version: number;
      primaryText: string;
      headline: string;
      description: string;
    }[];
  }[];
  adBundles: {
    id: string;
    intentId: string;
    lpVariantId: string;
    creativeVariantId: string;
    adCopyId: string;
    utmString: string;
  }[];
}

/**
 * Publish result
 */
export interface PublishResult {
  success: boolean;
  deployment: Deployment;
  adBundles: AdBundle[];
  manifest: SnapshotManifest;
  errors?: string[];
}

/**
 * Rollback result
 */
export interface RollbackResult {
  success: boolean;
  deployment: Deployment;
  errors?: string[];
}

/**
 * Publish Service
 */
export class PublishService {
  private repos: Repositories;
  private r2Bucket: R2Bucket;
  private basePublishUrl: string;

  constructor(repos: Repositories, r2Bucket: R2Bucket, basePublishUrl: string) {
    this.repos = repos;
    this.r2Bucket = r2Bucket;
    this.basePublishUrl = basePublishUrl;
  }

  /**
   * Publish a run
   * Creates deployment, generates ad bundles with UTM strings, saves snapshot
   */
  async publish(runId: string): Promise<PublishResult> {
    const errors: string[] = [];

    // 1. Get run and validate status
    const run = await this.repos.run.findById(runId);
    if (!run) {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        adBundles: [],
        manifest: null as unknown as SnapshotManifest,
        errors: ['Run not found'],
      };
    }

    // Validate run is in a publishable status
    if (!['Approved', 'Live', 'Paused'].includes(run.status)) {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        adBundles: [],
        manifest: null as unknown as SnapshotManifest,
        errors: [`Cannot publish run in ${run.status} status. Must be Approved, Live, or Paused.`],
      };
    }

    // 2. Parse run design for UTM policy
    let runDesign: RunDesign;
    try {
      runDesign = JSON.parse(run.runDesignJson || '{}') as RunDesign;
    } catch {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        adBundles: [],
        manifest: null as unknown as SnapshotManifest,
        errors: ['Invalid run design JSON'],
      };
    }

    const utmPolicy = runDesign.utm_policy ?? {
      source: 'meta',
      medium: 'paid_social',
      campaign_key: `run_${runId}`,
      content_key: 'intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}',
    };

    // 3. Get all intents for the run
    const intentsResult = await this.repos.intent.findByRunId(runId, { limit: 1000 });
    const intents = intentsResult.items.filter((i) => i.status === 'active');

    if (intents.length === 0) {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        adBundles: [],
        manifest: null as unknown as SnapshotManifest,
        errors: ['No active intents found for this run'],
      };
    }

    // 4. Get all variants for each intent
    const intentData: {
      intent: Intent;
      lpVariants: LpVariant[];
      creativeVariants: CreativeVariant[];
      adCopies: AdCopy[];
    }[] = [];

    for (const intent of intents) {
      const [lpResult, creativeResult, copyResult] = await Promise.all([
        this.repos.lpVariant.findByIntentId(intent.id, { limit: 100 }),
        this.repos.creativeVariant.findByIntentId(intent.id, { limit: 100 }),
        this.repos.adCopy.findByIntentId(intent.id, { limit: 100 }),
      ]);

      // Filter for approved variants only
      const lpVariants = lpResult.items.filter((v) => v.approvalStatus === 'approved');
      const creativeVariants = creativeResult.items.filter((v) => v.approvalStatus === 'approved');
      const adCopies = copyResult.items.filter((v) => v.approvalStatus === 'approved');

      if (lpVariants.length > 0 && creativeVariants.length > 0 && adCopies.length > 0) {
        intentData.push({ intent, lpVariants, creativeVariants, adCopies });
      } else {
        errors.push(`Intent ${intent.id} has no approved variants, skipping`);
      }
    }

    if (intentData.length === 0) {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        adBundles: [],
        manifest: null as unknown as SnapshotManifest,
        errors: ['No intents have approved variants'],
      };
    }

    // 5. Generate LP URLs
    const lpUrls: Record<string, string> = {};
    for (const data of intentData) {
      for (const lp of data.lpVariants) {
        lpUrls[lp.id] = this.generateLpUrl(runId, lp.id);
      }
    }

    // 6. Create deployment record
    const deploymentInput: CreateDeploymentInput = {
      id: ulid(),
      runId,
      status: 'draft',
      urlsJson: JSON.stringify({ baseUrl: this.basePublishUrl, lpUrls }),
    };

    const deployment = await this.repos.deployment.create(deploymentInput);

    // 7. Generate Ad Bundles (LP x Creative x Copy combinations)
    const bundleInputs: CreateAdBundleInput[] = [];
    for (const data of intentData) {
      for (const lp of data.lpVariants) {
        for (const creative of data.creativeVariants) {
          for (const copy of data.adCopies) {
            const utmString = this.generateUtmString(utmPolicy, {
              runId,
              intentId: data.intent.id,
              lpVariantId: lp.id,
              creativeVariantId: creative.id,
            });

            bundleInputs.push({
              id: ulid(),
              runId,
              intentId: data.intent.id,
              lpVariantId: lp.id,
              creativeVariantId: creative.id,
              adCopyId: copy.id,
              utmString,
              status: 'ready',
            });
          }
        }
      }
    }

    const adBundles = await this.repos.adBundle.createBatch(bundleInputs);

    // 8. Create snapshot manifest
    const manifest: SnapshotManifest = {
      version: '1.0',
      runId,
      deploymentId: deployment.id,
      timestamp: new Date().toISOString(),
      intents: intentData.map((data) => ({
        id: data.intent.id,
        title: data.intent.title,
        lpVariants: data.lpVariants.map((lp) => ({
          id: lp.id,
          version: lp.version,
          blocksJson: lp.blocksJson,
          themeJson: lp.themeJson,
        })),
        creativeVariants: data.creativeVariants.map((cr) => ({
          id: cr.id,
          size: cr.size,
          version: cr.version,
          imageR2Key: cr.imageR2Key,
          textLayersJson: cr.textLayersJson,
        })),
        adCopies: data.adCopies.map((copy) => ({
          id: copy.id,
          version: copy.version,
          primaryText: copy.primaryText,
          headline: copy.headline,
          description: copy.description,
        })),
      })),
      adBundles: adBundles.map((b) => ({
        id: b.id,
        intentId: b.intentId,
        lpVariantId: b.lpVariantId,
        creativeVariantId: b.creativeVariantId,
        adCopyId: b.adCopyId,
        utmString: b.utmString,
      })),
    };

    // 9. Save manifest to R2
    const manifestKey = `snapshots/${runId}/${deployment.id}/manifest.json`;
    await this.r2Bucket.put(manifestKey, JSON.stringify(manifest, null, 2), {
      httpMetadata: { contentType: 'application/json' },
    });

    // 10. Update deployment with manifest key and mark as published
    await this.repos.deployment.update(deployment.id, {
      snapshotManifestR2Key: manifestKey,
      status: 'published',
    });

    // 11. Update run status to Publishing then Live
    await this.repos.run.markPublished(runId);

    // 12. Get updated deployment
    const updatedDeployment = await this.repos.deployment.findById(deployment.id);

    return {
      success: true,
      deployment: updatedDeployment!,
      adBundles,
      manifest,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Rollback a deployment
   */
  async rollback(runId: string): Promise<RollbackResult> {
    // 1. Get current published deployment
    const deployment = await this.repos.deployment.findPublishedByRunId(runId);
    if (!deployment) {
      return {
        success: false,
        deployment: null as unknown as Deployment,
        errors: ['No published deployment found for this run'],
      };
    }

    // 2. Mark deployment as rolled back
    const updatedDeployment = await this.repos.deployment.markRolledBack(deployment.id);
    if (!updatedDeployment) {
      return {
        success: false,
        deployment: deployment,
        errors: ['Failed to update deployment status'],
      };
    }

    // 3. Archive all ad bundles for this run
    const bundlesResult = await this.repos.adBundle.findByRunId(runId, { limit: 1000 });
    for (const bundle of bundlesResult.items) {
      await this.repos.adBundle.updateStatus(bundle.id, 'archived');
    }

    // 4. Update run status to Paused
    await this.repos.run.updateStatus(runId, 'Paused');

    return {
      success: true,
      deployment: updatedDeployment,
    };
  }

  /**
   * Get deployment information for a run
   */
  async getDeployment(runId: string): Promise<{
    deployment: Deployment | null;
    adBundles: AdBundle[];
    manifest: SnapshotManifest | null;
  }> {
    const deployment = await this.repos.deployment.findLatestByRunId(runId);
    if (!deployment) {
      return { deployment: null, adBundles: [], manifest: null };
    }

    const bundlesResult = await this.repos.adBundle.findByRunId(runId, { limit: 1000 });

    let manifest: SnapshotManifest | null = null;
    if (deployment.snapshotManifestR2Key) {
      const obj = await this.r2Bucket.get(deployment.snapshotManifestR2Key);
      if (obj) {
        const text = await obj.text();
        manifest = JSON.parse(text) as SnapshotManifest;
      }
    }

    return {
      deployment,
      adBundles: bundlesResult.items,
      manifest,
    };
  }

  /**
   * Generate LP URL
   */
  private generateLpUrl(runId: string, lpVariantId: string): string {
    return `${this.basePublishUrl}/lp/${runId}/${lpVariantId}`;
  }

  /**
   * Generate UTM string based on policy
   * UTM Policy format:
   * - source: "meta"
   * - medium: "paid_social"
   * - campaign_key: "run_{run_id}"
   * - content_key: "intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}"
   */
  private generateUtmString(
    policy: UtmPolicy,
    params: {
      runId: string;
      intentId: string;
      lpVariantId: string;
      creativeVariantId: string;
    }
  ): string {
    const campaignKey = policy.campaign_key
      .replace('{run_id}', params.runId);

    const contentKey = policy.content_key
      .replace('{intent_id}', params.intentId)
      .replace('{lp_variant_id}', params.lpVariantId)
      .replace('{creative_variant_id}', params.creativeVariantId);

    const utmParams = new URLSearchParams({
      utm_source: policy.source,
      utm_medium: policy.medium,
      utm_campaign: campaignKey,
      utm_content: contentKey,
    });

    return utmParams.toString();
  }
}

/**
 * Create publish service from environment
 */
export function createPublishService(
  repos: Repositories,
  r2Bucket: R2Bucket,
  basePublishUrl?: string
): PublishService {
  const url = basePublishUrl ?? 'https://lp.example.com';
  return new PublishService(repos, r2Bucket, url);
}
