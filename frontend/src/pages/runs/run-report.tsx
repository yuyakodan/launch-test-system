import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  Button,
  Badge,
  Progress,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
  Alert,
  AlertTitle,
  AlertDescription,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
  Textarea,
} from '@/components/ui';
import { runsApi, reportApi } from '@/api';
import {
  ArrowLeft,
  Trophy,
  TrendingUp,
  AlertCircle,
  CheckCircle,
  Download,
  ArrowRight,
} from 'lucide-react';
import type { ConfidenceLevel } from '@/types';

const confidenceConfig: Record<ConfidenceLevel, { label: string; color: string; bgColor: string; description: string }> = {
  insufficient: {
    label: '不十分',
    color: 'text-red-600',
    bgColor: 'bg-red-100',
    description: '結論を出すにはデータが不足しています。サンプル数を増やす必要があります。',
  },
  directional: {
    label: '傾向あり',
    color: 'text-yellow-600',
    bgColor: 'bg-yellow-100',
    description: '傾向は見られますが、統計的に有意ではありません。慎重に判断してください。',
  },
  confident: {
    label: '確信あり',
    color: 'text-green-600',
    bgColor: 'bg-green-100',
    description: '統計的に有意な結果です。勝者に高い信頼性があります。',
  },
};

export function RunReportPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [showNextRunDialog, setShowNextRunDialog] = useState(false);
  const [showConfirmDecisionDialog, setShowConfirmDecisionDialog] = useState(false);
  const [decisionRationale, setDecisionRationale] = useState('');

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id!),
    enabled: !!id,
  });

  const { data: reportData, isLoading: reportLoading } = useQuery({
    queryKey: ['runs', id, 'report-full'],
    queryFn: () => reportApi.getReport(id!),
    enabled: !!id,
  });

  const confirmDecisionMutation = useMutation({
    mutationFn: () =>
      reportApi.confirmDecision(id!, {
        confirm: true,
        winnerVariantId: reportData?.variants?.find((v) => v.isWinner)?.variantId,
        rationale: decisionRationale,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      queryClient.invalidateQueries({ queryKey: ['runs', id, 'report-full'] });
      setShowConfirmDecisionDialog(false);
    },
  });

  const generateNextRunMutation = useMutation({
    mutationFn: () =>
      reportApi.generateNextRun(id!, {
        fixedGranularity: {
          fixed: (run?.fixed_granularity_json as { fixed?: Record<string, unknown> })?.fixed || {},
          explore: (run?.fixed_granularity_json as { explore?: Record<string, unknown> })?.explore || {},
        },
      }),
    onSuccess: (data) => {
      setShowNextRunDialog(false);
      navigate(`/runs/${data.runId}`);
    },
  });

  if (runLoading || reportLoading) {
    return <div className="text-center py-8 text-muted-foreground">読み込み中...</div>;
  }

  if (!run || !reportData) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">レポートが利用できません</p>
        <Button className="mt-4" onClick={() => navigate(`/runs/${id}`)}>
          Runに戻る
        </Button>
      </div>
    );
  }

  const { statistics, variants, decision, recommendations, nextRunSuggestions } = reportData;
  const confidence = statistics?.confidence || 'insufficient';
  const confidenceInfo = confidenceConfig[confidence];
  const winnerVariant = variants?.find((v) => v.isWinner);

  // Calculate totals
  const totals = variants?.reduce(
    (acc, v) => ({
      impressions: acc.impressions + v.impressions,
      clicks: acc.clicks + v.clicks,
      cost: acc.cost + v.cost,
      conversions: acc.conversions + v.conversions,
    }),
    { impressions: 0, clicks: 0, cost: 0, conversions: 0 }
  ) || { impressions: 0, clicks: 0, cost: 0, conversions: 0 };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/runs/${id}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Runに戻る
      </Button>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Runレポート</h1>
          <p className="text-muted-foreground mt-2">{run.name}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => reportApi.exportCsv(id!)}>
            <Download className="mr-2 h-4 w-4" />
            CSV出力
          </Button>
          <Button variant="outline" onClick={() => reportApi.exportPdf(id!)}>
            <Download className="mr-2 h-4 w-4" />
            PDF出力
          </Button>
        </div>
      </div>

      {/* Confidence Level Summary */}
      <Card className={confidenceInfo.bgColor}>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className={`p-3 rounded-full ${confidence === 'confident' ? 'bg-green-200' : confidence === 'directional' ? 'bg-yellow-200' : 'bg-red-200'}`}>
                {confidence === 'confident' ? (
                  <CheckCircle className={`h-8 w-8 ${confidenceInfo.color}`} />
                ) : confidence === 'directional' ? (
                  <TrendingUp className={`h-8 w-8 ${confidenceInfo.color}`} />
                ) : (
                  <AlertCircle className={`h-8 w-8 ${confidenceInfo.color}`} />
                )}
              </div>
              <div>
                <h2 className={`text-2xl font-bold ${confidenceInfo.color}`}>
                  {confidenceInfo.label}
                </h2>
                <p className="text-muted-foreground">{confidenceInfo.description}</p>
              </div>
            </div>
            <Badge className={`${confidenceInfo.bgColor} ${confidenceInfo.color} text-lg px-4 py-2`}>
              {statistics?.method?.toUpperCase() || 'WILSON'}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Winner Highlight */}
      {winnerVariant && (
        <Card className="border-2 border-green-500">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Trophy className="h-6 w-6 text-yellow-500" />
              <CardTitle>勝者</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold">{winnerVariant.variantName}</h3>
                <p className="text-muted-foreground">{winnerVariant.intentName}</p>
              </div>
              <div className="text-right">
                <div className="text-3xl font-bold text-green-600">
                  {(winnerVariant.cvr * 100).toFixed(2)}%
                </div>
                <div className="text-sm text-muted-foreground">
                  CVR ({(winnerVariant.cvrCI[0] * 100).toFixed(2)}% - {(winnerVariant.cvrCI[1] * 100).toFixed(2)}%)
                </div>
              </div>
            </div>
            <div className="grid gap-4 md:grid-cols-4 mt-6">
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold">{winnerVariant.impressions.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">インプレッション</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold">{winnerVariant.clicks.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">クリック</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold">{winnerVariant.conversions.toLocaleString()}</div>
                <div className="text-sm text-muted-foreground">コンバージョン</div>
              </div>
              <div className="text-center p-4 bg-gray-50 rounded">
                <div className="text-2xl font-bold">{winnerVariant.cpa.toLocaleString()} JPY</div>
                <div className="text-sm text-muted-foreground">CPA</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Performance Table */}
      <Card>
        <CardHeader>
          <CardTitle>バリアント別パフォーマンス</CardTitle>
          <CardDescription>各バリアントの詳細な指標</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>順位</TableHead>
                <TableHead>バリアント</TableHead>
                <TableHead>訴求</TableHead>
                <TableHead className="text-right">インプレッション</TableHead>
                <TableHead className="text-right">クリック</TableHead>
                <TableHead className="text-right">コスト</TableHead>
                <TableHead className="text-right">CV</TableHead>
                <TableHead className="text-right">CVR</TableHead>
                <TableHead className="text-right">CPA</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {variants?.sort((a, b) => a.rank - b.rank).map((variant) => (
                <TableRow key={variant.variantId} className={variant.isWinner ? 'bg-green-50' : ''}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <span className="font-bold">{variant.rank}</span>
                      {variant.isWinner && <Trophy className="h-4 w-4 text-yellow-500" />}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{variant.variantName}</TableCell>
                  <TableCell className="text-muted-foreground">{variant.intentName}</TableCell>
                  <TableCell className="text-right">{variant.impressions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{variant.clicks.toLocaleString()}</TableCell>
                  <TableCell className="text-right">{variant.cost.toLocaleString()} JPY</TableCell>
                  <TableCell className="text-right">{variant.conversions.toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <div>
                      <span className="font-medium">{(variant.cvr * 100).toFixed(2)}%</span>
                      <div className="text-xs text-muted-foreground">
                        ({(variant.cvrCI[0] * 100).toFixed(1)}%-{(variant.cvrCI[1] * 100).toFixed(1)}%)
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="text-right">{variant.cpa.toLocaleString()} JPY</TableCell>
                </TableRow>
              ))}
              {/* Totals Row */}
              <TableRow className="bg-gray-100 font-bold">
                <TableCell colSpan={3}>合計</TableCell>
                <TableCell className="text-right">{totals.impressions.toLocaleString()}</TableCell>
                <TableCell className="text-right">{totals.clicks.toLocaleString()}</TableCell>
                <TableCell className="text-right">{totals.cost.toLocaleString()} JPY</TableCell>
                <TableCell className="text-right">{totals.conversions.toLocaleString()}</TableCell>
                <TableCell className="text-right">
                  {totals.clicks > 0 ? ((totals.conversions / totals.clicks) * 100).toFixed(2) : '0.00'}%
                </TableCell>
                <TableCell className="text-right">
                  {totals.conversions > 0 ? (totals.cost / totals.conversions).toLocaleString() : '-'} JPY
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Statistical Details */}
      <Card>
        <CardHeader>
          <CardTitle>統計分析</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <h4 className="font-medium mb-4">サンプルサイズ進捗</h4>
              <div className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>合計サンプル数</span>
                    <span>{statistics?.totalSamples?.toLocaleString() || 0}</span>
                  </div>
                  <Progress
                    value={Math.min(
                      ((statistics?.totalSamples || 0) / (statistics?.requiredSamplesForConfident || 1)) * 100,
                      100
                    )}
                  />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span>合計コンバージョン数</span>
                    <span>{statistics?.totalConversions?.toLocaleString() || 0}</span>
                  </div>
                  <Progress
                    value={Math.min(
                      ((statistics?.totalConversions || 0) / (statistics?.requiredConversionsForConfident || 1)) * 100,
                      100
                    )}
                  />
                </div>
              </div>
            </div>
            <div>
              <h4 className="font-medium mb-4">確信レベルに到達するまで</h4>
              {confidence === 'confident' ? (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertTitle>十分なデータ</AlertTitle>
                  <AlertDescription>
                    確信を持って判断を下すのに十分なデータがあります。
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-2 text-sm">
                  <p>
                    あと
                    <strong>
                      {Math.max(0, (statistics?.requiredSamplesForConfident || 0) - (statistics?.totalSamples || 0)).toLocaleString()}
                    </strong>
                    サンプルが必要
                  </p>
                  <p>
                    あと
                    <strong>
                      {Math.max(0, (statistics?.requiredConversionsForConfident || 0) - (statistics?.totalConversions || 0)).toLocaleString()}
                    </strong>
                    コンバージョンが必要
                  </p>
                  <p className="text-muted-foreground mt-4">
                    {statistics?.message || 'テストを継続してデータを収集してください。'}
                  </p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>推奨アクション</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500 mt-0.5" />
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Actions */}
      <Card>
        <CardHeader>
          <CardTitle>アクション</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-4">
          {!(decision as unknown as { confirmed?: boolean })?.confirmed ? (
            <Button
              onClick={() => setShowConfirmDecisionDialog(true)}
              disabled={confidence === 'insufficient'}
            >
              <CheckCircle className="mr-2 h-4 w-4" />
              判定を確定
            </Button>
          ) : (
            <Badge className="bg-green-100 text-green-800">判定確定済み</Badge>
          )}
          <Button variant="outline" onClick={() => setShowNextRunDialog(true)}>
            <ArrowRight className="mr-2 h-4 w-4" />
            次のRunを生成
          </Button>
        </CardContent>
      </Card>

      {/* Confirm Decision Dialog */}
      <Dialog open={showConfirmDecisionDialog} onClose={() => setShowConfirmDecisionDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>判定を確定</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              勝者を確定します:{' '}
              <strong>{winnerVariant?.variantName || 'N/A'}</strong>
            </p>
            <div>
              <label className="text-sm font-medium">理由（任意）</label>
              <Textarea
                value={decisionRationale}
                onChange={(e) => setDecisionRationale(e.target.value)}
                placeholder="この判定についてのメモを追加..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDecisionDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => confirmDecisionMutation.mutate()}
              disabled={confirmDecisionMutation.isPending}
            >
              確定
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Generate Next Run Dialog */}
      <Dialog open={showNextRunDialog} onClose={() => setShowNextRunDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>次のRunを生成</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              このRunの固定/探索設定に基づいて新しいRunが作成されます。
            </p>
            {nextRunSuggestions && (
              <div className="space-y-2">
                <h4 className="font-medium">提案</h4>
                <div className="grid gap-2 md:grid-cols-2">
                  <div>
                    <h5 className="text-sm font-medium">固定要素</h5>
                    <ul className="text-sm text-muted-foreground">
                      {nextRunSuggestions.fixedElements.map((el, i) => (
                        <li key={i}>{el}</li>
                      ))}
                    </ul>
                  </div>
                  <div>
                    <h5 className="text-sm font-medium">探索要素</h5>
                    <ul className="text-sm text-muted-foreground">
                      {nextRunSuggestions.exploreElements.map((el, i) => (
                        <li key={i}>{el}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  {nextRunSuggestions.reasoning}
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNextRunDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => generateNextRunMutation.mutate()}
              disabled={generateNextRunMutation.isPending}
            >
              生成
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
