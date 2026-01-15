import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui';
import { intentsApi, runsApi } from '@/api';
import { ArrowLeft, Plus, ExternalLink, CheckCircle, XCircle, Clock } from 'lucide-react';
import type { VariantStatus } from '@/types';

const statusConfig: Record<VariantStatus, { label: string; icon: typeof Clock; color: string }> = {
  draft: { label: '下書き', icon: Clock, color: 'text-gray-500' },
  pending_qa: { label: 'QA待ち', icon: Clock, color: 'text-yellow-500' },
  approved: { label: '承認済み', icon: CheckCircle, color: 'text-green-500' },
  rejected: { label: '却下', icon: XCircle, color: 'text-red-500' },
  published: { label: '公開中', icon: CheckCircle, color: 'text-blue-500' },
};

export function IntentDetailPage() {
  const { runId, intentId } = useParams<{ runId: string; intentId: string }>();
  const navigate = useNavigate();

  const { data: run } = useQuery({
    queryKey: ['runs', runId],
    queryFn: () => runsApi.get(runId!),
    enabled: !!runId,
  });

  const { data: intents = [] } = useQuery({
    queryKey: ['intents', runId],
    queryFn: () => intentsApi.list(runId!),
    enabled: !!runId,
  });

  const intent = intents.find((i) => i.id === intentId);

  const { data: lpVariants = [] } = useQuery({
    queryKey: ['lp-variants', intentId],
    queryFn: () => intentsApi.listLpVariants(intentId!),
    enabled: !!intentId,
  });

  const { data: creativeVariants = [] } = useQuery({
    queryKey: ['creative-variants', intentId],
    queryFn: () => intentsApi.listCreativeVariants(intentId!),
    enabled: !!intentId,
  });

  const { data: adCopies = [] } = useQuery({
    queryKey: ['ad-copies', intentId],
    queryFn: () => intentsApi.listAdCopies(intentId!),
    enabled: !!intentId,
  });

  const { data: metrics } = useQuery({
    queryKey: ['intent-metrics', intentId],
    queryFn: () => intentsApi.getMetrics(intentId!),
    enabled: !!intentId,
  });

  if (!intent) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Intentが見つかりません</p>
        <Button className="mt-4" onClick={() => navigate(`/runs/${runId}`)}>
          Run詳細に戻る
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/runs/${runId}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        {run?.name || 'Run詳細'}に戻る
      </Button>

      {/* Intent header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{intent.name ?? (intent as unknown as { title?: string }).title}</h1>
            <Badge variant="outline">{intent.status}</Badge>
          </div>
          {(intent.description ?? (intent as unknown as { hypothesis?: string }).hypothesis) && (
            <p className="text-muted-foreground mt-2">{intent.description ?? (intent as unknown as { hypothesis?: string }).hypothesis}</p>
          )}
        </div>
      </div>

      {/* Intent info */}
      <Card>
        <CardHeader>
          <CardTitle>訴求情報</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 md:grid-cols-3">
            <div>
              <dt className="text-sm text-muted-foreground">ターゲット/仮説</dt>
              <dd className="mt-1 font-medium">{intent.target_audience ?? (intent as unknown as { hypothesis?: string }).hypothesis ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">キーメッセージ</dt>
              <dd className="mt-1 font-medium">{intent.key_message ?? '-'}</dd>
            </div>
            <div>
              <dt className="text-sm text-muted-foreground">CTA / 優先度</dt>
              <dd className="mt-1 font-medium">{intent.cta ?? ((intent as unknown as { priority?: number }).priority !== undefined ? `優先度: ${(intent as unknown as { priority?: number }).priority}` : '-')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Metrics */}
      {metrics && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">インプレッション</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.impressions.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">クリック数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.clicks.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                CTR: {(metrics.ctr * 100).toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">CV数</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{metrics.conversions.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                CVR: {(metrics.cvr * 100).toFixed(2)}%
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">CPA</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">¥{metrics.cpa.toLocaleString()}</div>
              <p className="text-xs text-muted-foreground">
                消化: ¥{metrics.spend.toLocaleString()}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Variants tabs */}
      <Tabs defaultValue="lp">
        <TabsList>
          <TabsTrigger value="lp">LP ({lpVariants.length})</TabsTrigger>
          <TabsTrigger value="creative">クリエイティブ ({creativeVariants.length})</TabsTrigger>
          <TabsTrigger value="copy">広告文 ({adCopies.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="lp" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>LP Variant</CardTitle>
                  <CardDescription>このIntentのランディングページ</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  LP追加
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {lpVariants.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  まだLPがありません
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>QA結果</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lpVariants.map((lp) => {
                      const config = statusConfig[lp.status];
                      const Icon = config.icon;
                      return (
                        <TableRow key={lp.id}>
                          <TableCell className="font-medium">{lp.name}</TableCell>
                          <TableCell>
                            <a
                              href={lp.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex items-center gap-1 text-blue-600 hover:underline"
                            >
                              {new URL(lp.url).hostname}
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          </TableCell>
                          <TableCell>
                            <div className={`flex items-center gap-1 ${config.color}`}>
                              <Icon className="h-4 w-4" />
                              <span>{config.label}</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            {lp.qa_result_json ? (
                              lp.qa_result_json.passed ? (
                                <Badge variant="default">Pass</Badge>
                              ) : (
                                <Badge variant="destructive">Fail</Badge>
                              )
                            ) : (
                              '-'
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="creative" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>クリエイティブ Variant</CardTitle>
                  <CardDescription>バナー・動画などのクリエイティブ</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  クリエイティブ追加
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {creativeVariants.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  まだクリエイティブがありません
                </p>
              ) : (
                <div className="grid gap-4 md:grid-cols-3">
                  {creativeVariants.map((creative) => {
                    const config = statusConfig[creative.status];
                    return (
                      <Card key={creative.id}>
                        <CardContent className="pt-4">
                          <div className="aspect-square bg-muted rounded-lg mb-3 overflow-hidden">
                            <img
                              src={creative.asset_url}
                              alt={creative.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <h4 className="font-medium">{creative.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            {creative.dimensions} / {creative.type}
                          </p>
                          <div className={`flex items-center gap-1 mt-2 ${config.color}`}>
                            <config.icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="copy" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>広告文</CardTitle>
                  <CardDescription>Primary Text / Headline / Description</CardDescription>
                </div>
                <Button size="sm">
                  <Plus className="mr-2 h-4 w-4" />
                  広告文追加
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {adCopies.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground">
                  まだ広告文がありません
                </p>
              ) : (
                <div className="space-y-4">
                  {adCopies.map((copy) => {
                    const config = statusConfig[copy.status];
                    return (
                      <div key={copy.id} className="rounded-lg border p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className={`flex items-center gap-1 ${config.color}`}>
                            <config.icon className="h-4 w-4" />
                            <span className="text-sm">{config.label}</span>
                          </div>
                          <Button variant="ghost" size="sm">
                            編集
                          </Button>
                        </div>
                        <div className="space-y-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Primary Text</p>
                            <p className="text-sm">{copy.primary_text}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Headline</p>
                            <p className="text-sm font-medium">{copy.headline}</p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Description</p>
                            <p className="text-sm">{copy.description}</p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
