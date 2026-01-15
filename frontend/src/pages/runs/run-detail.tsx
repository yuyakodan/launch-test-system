import { Link, useParams, useNavigate } from 'react-router-dom';
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
  Alert,
  AlertTitle,
  AlertDescription,
  Input,
  Label,
  Select,
  SelectOption,
  Dialog,
  DialogHeader,
  DialogTitle,
  DialogContent,
  DialogFooter,
} from '@/components/ui';
import { runsApi, intentsApi, qaApi, publishApi } from '@/api';
import {
  ArrowLeft,
  Play,
  Pause,
  Square,
  Plus,
  BarChart3,
  CheckCircle,
  AlertCircle,
  Edit,
  Save,
  X,
  FileText,
  Image,
  Send,
  Upload,
} from 'lucide-react';
import type {
  ConfidenceLevel,
} from '@/types';

// Local simplified types for run design - all properties optional for flexibility
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type RunDesignLocal = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type StopRuleLocal = Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type GranularityLocal = Record<string, any>;

const statusLabels: Record<string, string> = {
  draft: '下書き',
  Draft: '下書き',
  designing: '設計中',
  Designing: '設計中',
  generating: '生成中',
  Generating: '生成中',
  ready_for_review: 'レビュー待ち',
  ReadyForReview: 'レビュー待ち',
  approved: '承認済み',
  Approved: '承認済み',
  publishing: '公開中',
  Publishing: '公開中',
  live: '配信中',
  Live: '配信中',
  running: '実行中',
  Running: '実行中',
  paused: '一時停止',
  Paused: '一時停止',
  completed: '完了',
  Completed: '完了',
  archived: 'アーカイブ済み',
  Archived: 'アーカイブ済み',
};

const statusColors: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-800',
  Draft: 'bg-gray-100 text-gray-800',
  designing: 'bg-blue-100 text-blue-800',
  Designing: 'bg-blue-100 text-blue-800',
  generating: 'bg-yellow-100 text-yellow-800',
  Generating: 'bg-yellow-100 text-yellow-800',
  ready_for_review: 'bg-purple-100 text-purple-800',
  ReadyForReview: 'bg-purple-100 text-purple-800',
  approved: 'bg-green-100 text-green-800',
  Approved: 'bg-green-100 text-green-800',
  publishing: 'bg-orange-100 text-orange-800',
  Publishing: 'bg-orange-100 text-orange-800',
  live: 'bg-green-100 text-green-800',
  Live: 'bg-green-100 text-green-800',
  running: 'bg-green-100 text-green-800',
  Running: 'bg-green-100 text-green-800',
  paused: 'bg-yellow-100 text-yellow-800',
  Paused: 'bg-yellow-100 text-yellow-800',
  completed: 'bg-blue-100 text-blue-800',
  Completed: 'bg-blue-100 text-blue-800',
  archived: 'bg-gray-100 text-gray-800',
  Archived: 'bg-gray-100 text-gray-800',
};

const confidenceLabels: Record<ConfidenceLevel, { label: string; color: string }> = {
  confident: { label: '確信あり', color: 'bg-green-100 text-green-800' },
  directional: { label: '方向性あり', color: 'bg-yellow-100 text-yellow-800' },
  insufficient: { label: 'データ不足', color: 'bg-red-100 text-red-800' },
};

// Default values for run design
const defaultRunDesign: RunDesignLocal = {
  version: '1.0',
  operation_mode: 'manual',
  timezone: 'Asia/Tokyo',
  kpi: {
    primary: 'cvr',
    secondary: [],
    optimization_event: 'Lead',
  },
  budget: {
    currency: 'JPY',
    total_cap: 100000,
    daily_cap: undefined,
  },
  compare_axis: {
    mode: 'intent',
    notes: '',
  },
  form_mode: {
    type: 'internal',
    external_url: undefined,
    webhook_url: undefined,
  },
  sample_thresholds: {
    insufficient: { min_total_clicks: 200, min_total_cvs: 3 },
    directional: { min_total_clicks: 200, min_total_cvs: 5 },
    confident: { min_total_cvs: 20, min_per_variant_cvs: 5 },
  },
  confidence_thresholds: {
    method: 'wilson',
    alpha: 0.05,
    min_effect: 0,
  },
  utm_policy: {
    source: 'meta',
    medium: 'paid_social',
    campaign_key: 'run_{run_id}',
    content_key: 'intent_{intent_id}_lp_{lp_variant_id}_cr_{creative_variant_id}',
  },
};

// Default stop rule
const defaultStopRule: StopRuleLocal = {
  id: '',
  enabled: true,
  scope: 'run',
  type: 'spend_total_cap',
  gating: { min_elapsed_sec: 0 },
  params: { cap: 50000, currency: 'JPY' },
  action: { type: 'pause_run', notify: true, message: 'Budget cap reached' },
};

export function RunDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('overview');
  const [editingDesign, setEditingDesign] = useState(false);
  const [editingStopDsl, setEditingStopDsl] = useState(false);
  const [editingGranularity, setEditingGranularity] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);

  // Local state for editing
  const [designForm, setDesignForm] = useState<RunDesignLocal>(defaultRunDesign);
  const [stopRules, setStopRules] = useState<StopRuleLocal[]>([]);
  const [granularity, setGranularity] = useState<GranularityLocal>({
    version: '1.0',
    fixed: {},
    explore: {},
  });

  const { data: run, isLoading: runLoading } = useQuery({
    queryKey: ['runs', id],
    queryFn: () => runsApi.get(id!),
    enabled: !!id,
  });

  const { data: intents = [] } = useQuery({
    queryKey: ['intents', id],
    queryFn: () => intentsApi.list(id!),
    enabled: !!id,
  });

  const { data: report } = useQuery({
    queryKey: ['runs', id, 'report'],
    queryFn: () => runsApi.getReport(id!),
    enabled: !!id && ['running', 'paused', 'completed', 'Running', 'Paused', 'Completed'].includes(run?.status || ''),
  });

  const launchMutation = useMutation({
    mutationFn: () => runsApi.launch(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  const pauseMutation = useMutation({
    mutationFn: () => runsApi.pause(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  const stopMutation = useMutation({
    mutationFn: () => runsApi.stop(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  const saveDesignMutation = useMutation({
    mutationFn: (design: RunDesignLocal) => runsApi.setDesign(id!, design as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      setEditingDesign(false);
    },
  });

  const saveStopDslMutation = useMutation({
    mutationFn: (rules: StopRuleLocal[]) => runsApi.setStopDsl(id!, rules as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      setEditingStopDsl(false);
    },
  });

  const saveGranularityMutation = useMutation({
    mutationFn: (gran: GranularityLocal) => runsApi.setFixedGranularity(id!, gran as never),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      setEditingGranularity(false);
    },
  });

  const submitForReviewMutation = useMutation({
    mutationFn: () => qaApi.submitForReview(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id] });
      setShowSubmitDialog(false);
    },
  });

  const publishMutation = useMutation({
    mutationFn: () => publishApi.publish(id!),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['runs', id] }),
  });

  // Initialize forms when run data loads
  const initializeForms = () => {
    if (run) {
      const savedDesign = run.run_design_json as RunDesignLocal | undefined;
      setDesignForm({
        ...defaultRunDesign,
        ...savedDesign,
        operation_mode: run.mode || 'manual',
      });
      setStopRules(Array.isArray(run.stop_dsl_json) ? (run.stop_dsl_json as StopRuleLocal[]) : []);
      setGranularity({
        version: '1.0',
        fixed: (run.fixed_granularity_json as GranularityLocal)?.fixed || {},
        explore: (run.fixed_granularity_json as GranularityLocal)?.explore || {},
      });
    }
  };

  if (runLoading) {
    return <div className="text-center py-8 text-muted-foreground">読み込み中...</div>;
  }

  if (!run) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Runが見つかりません</p>
        <Button className="mt-4" onClick={() => navigate('/runs')}>
          Run一覧に戻る
        </Button>
      </div>
    );
  }

  const budgetCap = run.budget_cap ?? (run.run_design_json as RunDesignLocal)?.budget?.total_cap ?? 0;
  const spendTotal = run.spend_total ?? 0;
  const budgetProgress = budgetCap > 0 ? (spendTotal / budgetCap) * 100 : 0;
  const mode = run.mode ?? 'manual';
  const createdAt = run.created_at;
  const startedAt = run.started_at;

  const statusLower = run.status.toLowerCase();
  const canEdit = ['draft', 'designing'].includes(statusLower);
  const canLaunch = ['approved', 'paused'].includes(statusLower);
  const canPause = ['running', 'live'].includes(statusLower);
  const canStop = ['running', 'live', 'paused'].includes(statusLower);
  const canSubmitReview = ['draft', 'designing', 'generating'].includes(statusLower);
  const canPublish = ['approved'].includes(statusLower);

  const handleStartEditing = (type: 'design' | 'stopDsl' | 'granularity') => {
    initializeForms();
    if (type === 'design') setEditingDesign(true);
    else if (type === 'stopDsl') setEditingStopDsl(true);
    else if (type === 'granularity') setEditingGranularity(true);
  };

  const addStopRule = () => {
    setStopRules([
      ...stopRules,
      { ...defaultStopRule, id: `rule-${Date.now()}` },
    ]);
  };

  const removeStopRule = (index: number) => {
    setStopRules(stopRules.filter((_, i) => i !== index));
  };

  const updateStopRule = (index: number, updates: Partial<StopRuleLocal>) => {
    setStopRules(
      stopRules.map((rule, i) => (i === index ? { ...rule, ...updates } : rule))
    );
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate('/runs')}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Runs
      </Button>

      {/* Run header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{run.name}</h1>
            <Badge className={statusColors[run.status]}>
              {statusLabels[run.status] ?? run.status}
            </Badge>
            <Badge variant="outline" className="capitalize">{mode}</Badge>
          </div>
          <p className="text-muted-foreground mt-2">
            作成日: {createdAt ? new Date(createdAt).toLocaleDateString('ja-JP') : '-'}
            {startedAt && ` | 開始日: ${new Date(startedAt).toLocaleDateString('ja-JP')}`}
          </p>
        </div>
        <div className="flex gap-2">
          {canSubmitReview && (
            <Button variant="outline" onClick={() => setShowSubmitDialog(true)}>
              <Send className="mr-2 h-4 w-4" />
              レビュー申請
            </Button>
          )}
          {canPublish && (
            <Button variant="outline" onClick={() => publishMutation.mutate()} disabled={publishMutation.isPending}>
              <Upload className="mr-2 h-4 w-4" />
              公開
            </Button>
          )}
          {canLaunch && (
            <Button onClick={() => launchMutation.mutate()} disabled={launchMutation.isPending}>
              <Play className="mr-2 h-4 w-4" />
              {statusLower === 'paused' ? '再開' : '開始'}
            </Button>
          )}
          {canPause && (
            <Button variant="outline" onClick={() => pauseMutation.mutate()} disabled={pauseMutation.isPending}>
              <Pause className="mr-2 h-4 w-4" />
              一時停止
            </Button>
          )}
          {canStop && (
            <Button variant="destructive" onClick={() => stopMutation.mutate()} disabled={stopMutation.isPending}>
              <Square className="mr-2 h-4 w-4" />
              停止
            </Button>
          )}
        </div>
      </div>

      {/* Budget progress */}
      {budgetCap > 0 && (
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium">予算消化</span>
              <span className="text-sm text-muted-foreground">
                {spendTotal.toLocaleString()} / {budgetCap.toLocaleString()} JPY
              </span>
            </div>
            <Progress value={budgetProgress} />
          </CardContent>
        </Card>
      )}

      {/* Decision/Report */}
      {report?.decision && (
        <Alert>
          <BarChart3 className="h-4 w-4" />
          <AlertTitle className="flex items-center gap-2">
            テスト結果
            <Badge className={confidenceLabels[report.decision.confidence_level].color}>
              {confidenceLabels[report.decision.confidence_level].label}
            </Badge>
          </AlertTitle>
          <AlertDescription>
            {report.decision.reasoning}
          </AlertDescription>
        </Alert>
      )}

      {/* Main content tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概要</TabsTrigger>
          <TabsTrigger value="intents">訴求</TabsTrigger>
          <TabsTrigger value="design">テスト設計</TabsTrigger>
          <TabsTrigger value="stop-rules">停止条件</TabsTrigger>
          <TabsTrigger value="granularity">固定/探索</TabsTrigger>
          <TabsTrigger value="metrics">指標</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="mt-4">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">訴求数</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{intents.length}</div>
                <Link to={`/runs/${id}/intents/new`} className="text-sm text-blue-600 hover:underline">
                  + 訴求を追加
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">モード</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold capitalize">{mode}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm font-medium">予算</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{budgetCap.toLocaleString()} JPY</div>
                <p className="text-sm text-muted-foreground">消化: {spendTotal.toLocaleString()} JPY</p>
              </CardContent>
            </Card>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>クイックアクション</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link to={`/runs/${id}/generation`}>
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="mr-2 h-4 w-4" />
                    LP/バナー/広告コピー生成
                  </Button>
                </Link>
                <Link to={`/runs/${id}/report`}>
                  <Button variant="outline" className="w-full justify-start">
                    <BarChart3 className="mr-2 h-4 w-4" />
                    レポート表示
                  </Button>
                </Link>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>ステータスフロー</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {['Draft', 'Designing', 'Generating', 'ReadyForReview', 'Approved', 'Publishing', 'Live', 'Running', 'Completed'].map((status) => (
                    <Badge
                      key={status}
                      className={`${statusColors[status]} ${run.status === status || run.status === status.toLowerCase() ? 'ring-2 ring-offset-2' : 'opacity-50'}`}
                    >
                      {statusLabels[status]}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Intents Tab */}
        <TabsContent value="intents" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>訴求</CardTitle>
                  <CardDescription>このRunのテストバリエーション</CardDescription>
                </div>
                <Link to={`/runs/${id}/intents/new`}>
                  <Button size="sm">
                    <Plus className="mr-2 h-4 w-4" />
                    訴求を追加
                  </Button>
                </Link>
              </div>
            </CardHeader>
            <CardContent>
              {intents.length === 0 ? (
                <div className="text-center py-8">
                  <p className="text-muted-foreground">訴求がありません</p>
                  <Link to={`/runs/${id}/intents/new`}>
                    <Button className="mt-4">
                      <Plus className="mr-2 h-4 w-4" />
                      最初の訴求を追加
                    </Button>
                  </Link>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>名前</TableHead>
                      <TableHead>ターゲット</TableHead>
                      <TableHead>ステータス</TableHead>
                      <TableHead>CVR</TableHead>
                      <TableHead>操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {intents.map((intent) => {
                      const ranking = report?.rankings.find((r) => r.intentId === intent.id);
                      const intentName = intent.name ?? (intent as { title?: string }).title ?? '-';
                      const targetAudience = intent.target_audience ?? (intent as { hypothesis?: string }).hypothesis ?? '-';
                      return (
                        <TableRow key={intent.id}>
                          <TableCell>
                            <Link
                              to={`/runs/${id}/intents/${intent.id}`}
                              className="font-medium hover:underline flex items-center gap-2"
                            >
                              {intentName}
                              {ranking?.isWinner && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </Link>
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {targetAudience}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{intent.status}</Badge>
                          </TableCell>
                          <TableCell>
                            {ranking ? (
                              <span>
                                {(ranking.cvr * 100).toFixed(2)}%
                                <span className="text-xs text-muted-foreground ml-1">
                                  ({(ranking.cvrCI[0] * 100).toFixed(1)}-{(ranking.cvrCI[1] * 100).toFixed(1)}%)
                                </span>
                              </span>
                            ) : (
                              '-'
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-2">
                              <Link to={`/runs/${id}/intents/${intent.id}/lp`}>
                                <Button size="sm" variant="ghost">
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </Link>
                              <Link to={`/runs/${id}/intents/${intent.id}/creative`}>
                                <Button size="sm" variant="ghost">
                                  <Image className="h-4 w-4" />
                                </Button>
                              </Link>
                            </div>
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

        {/* Run Design Tab */}
        <TabsContent value="design" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>テスト設計</CardTitle>
                  <CardDescription>テスト設定とパラメータ</CardDescription>
                </div>
                {canEdit && !editingDesign && (
                  <Button size="sm" variant="outline" onClick={() => handleStartEditing('design')}>
                    <Edit className="mr-2 h-4 w-4" />
                    編集
                  </Button>
                )}
                {editingDesign && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingDesign(false)}>
                      <X className="mr-2 h-4 w-4" />
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveDesignMutation.mutate(designForm)}
                      disabled={saveDesignMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      保存
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingDesign ? (
                <div className="space-y-6">
                  {/* KPI Settings */}
                  <div className="space-y-4">
                    <h4 className="font-medium">KPI設定</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>主要指標</Label>
                        <Select
                          value={designForm.kpi.primary}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            kpi: { ...designForm.kpi, primary: e.target.value as 'cpa' | 'cv' | 'cvr' },
                          })}
                        >
                          <SelectOption value="cvr">CVR</SelectOption>
                          <SelectOption value="cpa">CPA</SelectOption>
                          <SelectOption value="cv">CV</SelectOption>
                        </Select>
                      </div>
                      <div>
                        <Label>比較軸</Label>
                        <Select
                          value={designForm.compare_axis.mode}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            compare_axis: { ...designForm.compare_axis, mode: e.target.value as 'intent' | 'lp_variant' | 'creative_variant' | 'bundle' },
                          })}
                        >
                          <SelectOption value="intent">訴求</SelectOption>
                          <SelectOption value="lp_variant">LPバリアント</SelectOption>
                          <SelectOption value="creative_variant">クリエイティブバリアント</SelectOption>
                          <SelectOption value="bundle">バンドル</SelectOption>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Budget Settings */}
                  <div className="space-y-4">
                    <h4 className="font-medium">予算設定</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>上限予算</Label>
                        <Input
                          type="number"
                          value={designForm.budget.total_cap}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            budget: { ...designForm.budget, total_cap: Number(e.target.value) },
                          })}
                        />
                      </div>
                      <div>
                        <Label>日次上限（任意）</Label>
                        <Input
                          type="number"
                          value={designForm.budget.daily_cap || ''}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            budget: { ...designForm.budget, daily_cap: e.target.value ? Number(e.target.value) : undefined },
                          })}
                        />
                      </div>
                      <div>
                        <Label>通貨</Label>
                        <Select
                          value={designForm.budget.currency}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            budget: { ...designForm.budget, currency: e.target.value },
                          })}
                        >
                          <SelectOption value="JPY">JPY</SelectOption>
                          <SelectOption value="USD">USD</SelectOption>
                        </Select>
                      </div>
                    </div>
                  </div>

                  {/* Form Mode */}
                  <div className="space-y-4">
                    <h4 className="font-medium">フォームモード</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>フォームタイプ</Label>
                        <Select
                          value={designForm.form_mode.type}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            form_mode: { ...designForm.form_mode, type: e.target.value as 'internal' | 'external_redirect' | 'webhook_submit' },
                          })}
                        >
                          <SelectOption value="internal">内部フォーム</SelectOption>
                          <SelectOption value="external_redirect">外部リダイレクト</SelectOption>
                          <SelectOption value="webhook_submit">Webhook送信</SelectOption>
                        </Select>
                      </div>
                      {designForm.form_mode.type === 'external_redirect' && (
                        <div>
                          <Label>外部URL</Label>
                          <Input
                            value={designForm.form_mode.external_url || ''}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              form_mode: { ...designForm.form_mode, external_url: e.target.value },
                            })}
                            placeholder="https://..."
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sample Thresholds */}
                  <div className="space-y-4">
                    <h4 className="font-medium">サンプルしきい値</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Insufficient</Label>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            placeholder="Min clicks"
                            value={designForm.sample_thresholds.insufficient.min_total_clicks}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                insufficient: {
                                  ...designForm.sample_thresholds.insufficient,
                                  min_total_clicks: Number(e.target.value),
                                },
                              },
                            })}
                          />
                          <Input
                            type="number"
                            placeholder="Min CVs"
                            value={designForm.sample_thresholds.insufficient.min_total_cvs}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                insufficient: {
                                  ...designForm.sample_thresholds.insufficient,
                                  min_total_cvs: Number(e.target.value),
                                },
                              },
                            })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Directional</Label>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            placeholder="Min clicks"
                            value={designForm.sample_thresholds.directional.min_total_clicks}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                directional: {
                                  ...designForm.sample_thresholds.directional,
                                  min_total_clicks: Number(e.target.value),
                                },
                              },
                            })}
                          />
                          <Input
                            type="number"
                            placeholder="Min CVs"
                            value={designForm.sample_thresholds.directional.min_total_cvs}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                directional: {
                                  ...designForm.sample_thresholds.directional,
                                  min_total_cvs: Number(e.target.value),
                                },
                              },
                            })}
                          />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Confident</Label>
                        <div className="space-y-1">
                          <Input
                            type="number"
                            placeholder="Min total CVs"
                            value={designForm.sample_thresholds.confident.min_total_cvs}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                confident: {
                                  ...designForm.sample_thresholds.confident,
                                  min_total_cvs: Number(e.target.value),
                                },
                              },
                            })}
                          />
                          <Input
                            type="number"
                            placeholder="Min per variant CVs"
                            value={designForm.sample_thresholds.confident.min_per_variant_cvs}
                            onChange={(e) => setDesignForm({
                              ...designForm,
                              sample_thresholds: {
                                ...designForm.sample_thresholds,
                                confident: {
                                  ...designForm.sample_thresholds.confident,
                                  min_per_variant_cvs: Number(e.target.value),
                                },
                              },
                            })}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Confidence Thresholds */}
                  <div className="space-y-4">
                    <h4 className="font-medium">統計設定</h4>
                    <div className="grid gap-4 md:grid-cols-3">
                      <div>
                        <Label>手法</Label>
                        <Select
                          value={designForm.confidence_thresholds.method}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            confidence_thresholds: {
                              ...designForm.confidence_thresholds,
                              method: e.target.value as 'wilson' | 'bayes',
                            },
                          })}
                        >
                          <SelectOption value="wilson">Wilson CI</SelectOption>
                          <SelectOption value="bayes">Bayesian</SelectOption>
                        </Select>
                      </div>
                      <div>
                        <Label>有意水準</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={designForm.confidence_thresholds.alpha}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            confidence_thresholds: {
                              ...designForm.confidence_thresholds,
                              alpha: Number(e.target.value),
                            },
                          })}
                        />
                      </div>
                      <div>
                        <Label>最小効果量</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={designForm.confidence_thresholds.min_effect}
                          onChange={(e) => setDesignForm({
                            ...designForm,
                            confidence_thresholds: {
                              ...designForm.confidence_thresholds,
                              min_effect: Number(e.target.value),
                            },
                          })}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="font-medium mb-2">KPI</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">主要指標</dt>
                          <dd className="uppercase">{(run.run_design_json as RunDesignLocal)?.kpi?.primary || '-'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">比較軸</dt>
                          <dd>{(run.run_design_json as RunDesignLocal)?.compare_axis?.mode || '-'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">予算</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">上限予算</dt>
                          <dd>{((run.run_design_json as RunDesignLocal)?.budget?.total_cap || 0).toLocaleString()} JPY</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">日次上限</dt>
                          <dd>{(run.run_design_json as RunDesignLocal)?.budget?.daily_cap?.toLocaleString() || '-'} JPY</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div>
                      <h4 className="font-medium mb-2">フォームモード</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">タイプ</dt>
                          <dd>{(run.run_design_json as RunDesignLocal)?.form_mode?.type || 'internal'}</dd>
                        </div>
                      </dl>
                    </div>
                    <div>
                      <h4 className="font-medium mb-2">統計設定</h4>
                      <dl className="space-y-1 text-sm">
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">手法</dt>
                          <dd>{(run.run_design_json as RunDesignLocal)?.confidence_thresholds?.method || 'wilson'}</dd>
                        </div>
                        <div className="flex justify-between">
                          <dt className="text-muted-foreground">有意水準</dt>
                          <dd>{(run.run_design_json as RunDesignLocal)?.confidence_thresholds?.alpha || 0.05}</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Stop Rules Tab */}
        <TabsContent value="stop-rules" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>停止条件</CardTitle>
                  <CardDescription>Runを一時停止または停止する条件</CardDescription>
                </div>
                {canEdit && !editingStopDsl && (
                  <Button size="sm" variant="outline" onClick={() => handleStartEditing('stopDsl')}>
                    <Edit className="mr-2 h-4 w-4" />
                    編集
                  </Button>
                )}
                {editingStopDsl && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingStopDsl(false)}>
                      <X className="mr-2 h-4 w-4" />
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveStopDslMutation.mutate(stopRules)}
                      disabled={saveStopDslMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      保存
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingStopDsl ? (
                <div className="space-y-4">
                  {stopRules.map((rule, index) => (
                    <div key={rule.id || index} className="border rounded-lg p-4 space-y-4">
                      <div className="flex items-center justify-between">
                        <h4 className="font-medium">ルール {index + 1}</h4>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeStopRule(index)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <Label>タイプ</Label>
                          <Select
                            value={rule.type}
                            onChange={(e) => updateStopRule(index, { type: e.target.value as StopRuleLocal['type'] })}
                          >
                            <SelectOption value="spend_total_cap">消化額上限</SelectOption>
                            <SelectOption value="spend_daily_cap">日次消化額上限</SelectOption>
                            <SelectOption value="cpa_cap">CPA上限</SelectOption>
                            <SelectOption value="cv_zero_duration">CV発生なし期間</SelectOption>
                            <SelectOption value="measurement_anomaly">計測異常</SelectOption>
                            <SelectOption value="meta_rejected">Meta却下</SelectOption>
                            <SelectOption value="sync_failure_streak">同期失敗連続</SelectOption>
                          </Select>
                        </div>
                        <div>
                          <Label>スコープ</Label>
                          <Select
                            value={rule.scope}
                            onChange={(e) => updateStopRule(index, { scope: e.target.value as StopRuleLocal['scope'] })}
                          >
                            <SelectOption value="run">Run</SelectOption>
                            <SelectOption value="bundle">バンドル</SelectOption>
                            <SelectOption value="notify_only">通知のみ</SelectOption>
                          </Select>
                        </div>
                        <div>
                          <Label>アクション</Label>
                          <Select
                            value={rule.action.type}
                            onChange={(e) => updateStopRule(index, {
                              action: { ...rule.action, type: e.target.value as StopRuleLocal['action']['type'] },
                            })}
                          >
                            <SelectOption value="pause_run">Run一時停止</SelectOption>
                            <SelectOption value="pause_bundle">バンドル一時停止</SelectOption>
                            <SelectOption value="notify_only">通知のみ</SelectOption>
                            <SelectOption value="create_incident">インシデント作成</SelectOption>
                          </Select>
                        </div>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        <div>
                          <Label>しきい値</Label>
                          <Input
                            type="number"
                            value={(rule.params as { cap?: number }).cap || ''}
                            onChange={(e) => updateStopRule(index, {
                              params: { ...rule.params, cap: Number(e.target.value) },
                            })}
                            placeholder="例: 50000"
                          />
                        </div>
                        <div>
                          <Label>メッセージ</Label>
                          <Input
                            value={rule.action.message}
                            onChange={(e) => updateStopRule(index, {
                              action: { ...rule.action, message: e.target.value },
                            })}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={rule.enabled}
                          onChange={(e) => updateStopRule(index, { enabled: e.target.checked })}
                          className="h-4 w-4"
                        />
                        <Label>有効</Label>
                      </div>
                    </div>
                  ))}
                  <Button variant="outline" onClick={addStopRule}>
                    <Plus className="mr-2 h-4 w-4" />
                    ルールを追加
                  </Button>
                </div>
              ) : (
                <div>
                  {Array.isArray(run.stop_dsl_json) && run.stop_dsl_json.length > 0 ? (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>タイプ</TableHead>
                          <TableHead>スコープ</TableHead>
                          <TableHead>しきい値</TableHead>
                          <TableHead>アクション</TableHead>
                          <TableHead>有効</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(run.stop_dsl_json as StopRuleLocal[]).map((rule, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{rule.type}</TableCell>
                            <TableCell>{rule.scope}</TableCell>
                            <TableCell>
                              {(rule.params as { cap?: number }).cap?.toLocaleString() || '-'}
                            </TableCell>
                            <TableCell>{rule.action?.type || '-'}</TableCell>
                            <TableCell>
                              {rule.enabled ? (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              ) : (
                                <X className="h-4 w-4 text-gray-400" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  ) : (
                    <p className="text-muted-foreground text-center py-4">停止条件が設定されていません</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Fixed/Explore Granularity Tab */}
        <TabsContent value="granularity" className="mt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>固定/探索粒度</CardTitle>
                  <CardDescription>次のRunで固定する要素と探索する要素</CardDescription>
                </div>
                {canEdit && !editingGranularity && (
                  <Button size="sm" variant="outline" onClick={() => handleStartEditing('granularity')}>
                    <Edit className="mr-2 h-4 w-4" />
                    編集
                  </Button>
                )}
                {editingGranularity && (
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={() => setEditingGranularity(false)}>
                      <X className="mr-2 h-4 w-4" />
                      キャンセル
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => saveGranularityMutation.mutate(granularity)}
                      disabled={saveGranularityMutation.isPending}
                    >
                      <Save className="mr-2 h-4 w-4" />
                      保存
                    </Button>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {editingGranularity ? (
                <div className="grid gap-6 md:grid-cols-2">
                  {/* Fixed Section */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-lg">固定要素</h4>
                    <div className="space-y-4">
                      <div>
                        <Label className="font-medium">LP</Label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.lp?.lock_structure || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  lp: { ...granularity.fixed.lp, lock_structure: e.target.checked },
                                },
                              })}
                            />
                            構造を固定
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.lp?.lock_theme || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  lp: { ...granularity.fixed.lp, lock_theme: e.target.checked },
                                },
                              })}
                            />
                            テーマを固定
                          </label>
                        </div>
                      </div>
                      <div>
                        <Label className="font-medium">バナー</Label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.banner?.lock_template || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  banner: { ...granularity.fixed.banner, lock_template: e.target.checked },
                                },
                              })}
                            />
                            テンプレートを固定
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.banner?.lock_image_layout || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  banner: { ...granularity.fixed.banner, lock_image_layout: e.target.checked },
                                },
                              })}
                            />
                            画像レイアウトを固定
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.banner?.lock_text_layers || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  banner: { ...granularity.fixed.banner, lock_text_layers: e.target.checked },
                                },
                              })}
                            />
                            テキストレイヤーを固定
                          </label>
                        </div>
                      </div>
                      <div>
                        <Label className="font-medium">広告コピー</Label>
                        <div className="space-y-2 mt-2">
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.ad_copy?.lock_primary_text || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  ad_copy: { ...granularity.fixed.ad_copy, lock_primary_text: e.target.checked },
                                },
                              })}
                            />
                            本文を固定
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.ad_copy?.lock_headline || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  ad_copy: { ...granularity.fixed.ad_copy, lock_headline: e.target.checked },
                                },
                              })}
                            />
                            見出しを固定
                          </label>
                          <label className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={granularity.fixed.ad_copy?.lock_description || false}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                fixed: {
                                  ...granularity.fixed,
                                  ad_copy: { ...granularity.fixed.ad_copy, lock_description: e.target.checked },
                                },
                              })}
                            />
                            説明文を固定
                          </label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Explore Section */}
                  <div className="space-y-4">
                    <h4 className="font-medium text-lg">探索設定</h4>
                    <div className="space-y-4">
                      <div>
                        <Label className="font-medium">訴求</Label>
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label className="text-sm">新規訴求の最大数</Label>
                            <Input
                              type="number"
                              value={granularity.explore.intent?.max_new_intents || 1}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                explore: {
                                  ...granularity.explore,
                                  intent: {
                                    ...granularity.explore.intent,
                                    max_new_intents: Number(e.target.value),
                                  },
                                },
                              })}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="font-medium">LP</Label>
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label className="text-sm">新規FVコピーの最大数</Label>
                            <Input
                              type="number"
                              value={granularity.explore.lp?.max_new_fv_copies || 3}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                explore: {
                                  ...granularity.explore,
                                  lp: {
                                    ...granularity.explore.lp,
                                    max_new_fv_copies: Number(e.target.value),
                                  },
                                },
                              })}
                            />
                          </div>
                          <div>
                            <Label className="text-sm">新規CTAコピーの最大数</Label>
                            <Input
                              type="number"
                              value={granularity.explore.lp?.max_new_cta_copies || 2}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                explore: {
                                  ...granularity.explore,
                                  lp: {
                                    ...granularity.explore.lp,
                                    max_new_cta_copies: Number(e.target.value),
                                  },
                                },
                              })}
                            />
                          </div>
                        </div>
                      </div>
                      <div>
                        <Label className="font-medium">バナー</Label>
                        <div className="space-y-2 mt-2">
                          <div>
                            <Label className="text-sm">新規テキストバリアントの最大数</Label>
                            <Input
                              type="number"
                              value={granularity.explore.banner?.max_new_text_variants || 6}
                              onChange={(e) => setGranularity({
                                ...granularity,
                                explore: {
                                  ...granularity.explore,
                                  banner: {
                                    ...granularity.explore.banner,
                                    max_new_text_variants: Number(e.target.value),
                                  },
                                },
                              })}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="grid gap-6 md:grid-cols-2">
                  <div>
                    <h4 className="font-medium mb-2">固定要素</h4>
                    <ul className="text-sm space-y-1 text-muted-foreground">
                      {(run.fixed_granularity_json as GranularityLocal)?.fixed?.lp?.lock_structure && <li>LP構造</li>}
                      {(run.fixed_granularity_json as GranularityLocal)?.fixed?.lp?.lock_theme && <li>LPテーマ</li>}
                      {(run.fixed_granularity_json as GranularityLocal)?.fixed?.banner?.lock_template && <li>バナーテンプレート</li>}
                      {(run.fixed_granularity_json as GranularityLocal)?.fixed?.ad_copy?.lock_headline && <li>広告見出し</li>}
                      {!Object.values((run.fixed_granularity_json as GranularityLocal)?.fixed || {}).some(Boolean) && <li>未設定</li>}
                    </ul>
                  </div>
                  <div>
                    <h4 className="font-medium mb-2">探索設定</h4>
                    <dl className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">新規訴求の最大数</dt>
                        <dd>{(run.fixed_granularity_json as GranularityLocal)?.explore?.intent?.max_new_intents ?? 1}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">新規FVコピーの最大数</dt>
                        <dd>{(run.fixed_granularity_json as GranularityLocal)?.explore?.lp?.max_new_fv_copies ?? 3}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-muted-foreground">新規バナーバリアントの最大数</dt>
                        <dd>{(run.fixed_granularity_json as GranularityLocal)?.explore?.banner?.max_new_text_variants ?? 6}</dd>
                      </div>
                    </dl>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Metrics Tab */}
        <TabsContent value="metrics" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>指標</CardTitle>
              <CardDescription>リアルタイム計測データ</CardDescription>
            </CardHeader>
            <CardContent>
              {!report ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertCircle className="mx-auto h-12 w-12 mb-4" />
                  <p>テスト開始後に指標が表示されます</p>
                </div>
              ) : (
                <div className="space-y-6">
                  {report.rankings && report.rankings.length > 0 && (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>順位</TableHead>
                          <TableHead>訴求</TableHead>
                          <TableHead>CVR</TableHead>
                          <TableHead>95%信頼区間</TableHead>
                          <TableHead>勝者</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {report.rankings.map((ranking) => (
                          <TableRow key={ranking.intentId}>
                            <TableCell className="font-bold">{ranking.rank}</TableCell>
                            <TableCell>{ranking.intentName}</TableCell>
                            <TableCell>{(ranking.cvr * 100).toFixed(2)}%</TableCell>
                            <TableCell className="text-muted-foreground">
                              {(ranking.cvrCI[0] * 100).toFixed(2)}% - {(ranking.cvrCI[1] * 100).toFixed(2)}%
                            </TableCell>
                            <TableCell>
                              {ranking.isWinner && (
                                <CheckCircle className="h-4 w-4 text-green-600" />
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}

                  {report.recommendations && report.recommendations.length > 0 && (
                    <div className="rounded-lg border p-4">
                      <h4 className="font-semibold mb-2">推奨アクション</h4>
                      <ul className="list-disc list-inside space-y-1 text-sm text-muted-foreground">
                        {report.recommendations.map((rec, i) => (
                          <li key={i}>{rec}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Submit for Review Dialog */}
      <Dialog open={showSubmitDialog} onClose={() => setShowSubmitDialog(false)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>レビュー申請</DialogTitle>
          </DialogHeader>
          <p className="text-muted-foreground">
            すべてのLPバリアント、クリエイティブ、広告コピーに対してQAチェックを実行します。
            承認前にブロッカーを解決する必要があります。
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSubmitDialog(false)}>
              キャンセル
            </Button>
            <Button
              onClick={() => submitForReviewMutation.mutate()}
              disabled={submitForReviewMutation.isPending}
            >
              申請
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
