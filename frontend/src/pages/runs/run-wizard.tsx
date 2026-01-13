import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
  Button,
  Input,
  Label,
  Select,
  SelectOption,
  Alert,
  AlertDescription,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from '@/components/ui';
import { projectsApi, runsApi } from '@/api';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

type WizardStep = 'basic' | 'design' | 'stop-rules' | 'review';

const steps: { id: WizardStep; title: string }[] = [
  { id: 'basic', title: '基本情報' },
  { id: 'design', title: 'テスト設計' },
  { id: 'stop-rules', title: '停止条件' },
  { id: 'review', title: '確認' },
];

export function RunWizardPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();

  const preselectedProjectId = searchParams.get('project') || '';

  const [currentStep, setCurrentStep] = useState<WizardStep>('basic');
  const [error, setError] = useState('');

  // Form state
  const [formData, setFormData] = useState({
    project_id: preselectedProjectId,
    name: '',
    mode: 'manual' as 'manual' | 'hybrid' | 'auto',
    budget_cap: 50000,
    // Design
    comparison_axis: 'intent' as 'intent' | 'lp' | 'banner' | 'combination',
    target_metric: 'cvr' as 'cvr' | 'ctr' | 'cpa',
    min_sample_size: 100,
    winning_threshold: 0.95,
    // Stop rules
    spend_total_cap: 50000,
    cpa_cap: 5000,
    cv_zero_duration: 24,
  });

  const { data: projects = [] } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list({ status: 'active' }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const run = await runsApi.create({
        projectId: formData.project_id,
        name: formData.name,
        operationMode: formData.mode,
      });

      // Set design
      await runsApi.setDesign(run.id, {
        comparisonAxis: formData.comparison_axis,
        targetMetric: formData.target_metric,
        minSampleSize: formData.min_sample_size,
        winningThreshold: formData.winning_threshold,
      });

      // Set stop rules
      await runsApi.setStopDsl(run.id, [
        { rule_type: 'spend_total_cap', threshold: formData.spend_total_cap },
        { rule_type: 'cpa_cap', threshold: formData.cpa_cap },
        { rule_type: 'cv_zero_duration', duration_hours: formData.cv_zero_duration },
      ]);

      return run;
    },
    onSuccess: (run) => {
      queryClient.invalidateQueries({ queryKey: ['runs'] });
      navigate(`/runs/${run.id}`);
    },
    onError: (err) => {
      setError(err instanceof Error ? err.message : 'Runの作成に失敗しました');
    },
  });

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  const handleNext = () => {
    if (currentStep === 'basic') {
      if (!formData.project_id) {
        setError('プロジェクトを選択してください');
        return;
      }
      if (!formData.name.trim()) {
        setError('Run名を入力してください');
        return;
      }
    }
    setError('');
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < steps.length) {
      setCurrentStep(steps[nextIndex].id);
    }
  };

  const handleBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(steps[prevIndex].id);
    }
  };

  const handleSubmit = () => {
    createMutation.mutate();
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <Button variant="ghost" onClick={() => navigate(-1)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        戻る
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>新規Run作成</CardTitle>
          <CardDescription>
            テスト実行の設定を行います
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* Step indicator */}
          <div className="flex items-center justify-between mb-8">
            {steps.map((step, index) => (
              <div key={step.id} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 ${
                    index < currentStepIndex
                      ? 'bg-primary border-primary text-primary-foreground'
                      : index === currentStepIndex
                        ? 'border-primary text-primary'
                        : 'border-muted text-muted-foreground'
                  }`}
                >
                  {index < currentStepIndex ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    index + 1
                  )}
                </div>
                <span
                  className={`ml-2 text-sm ${
                    index === currentStepIndex
                      ? 'font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.title}
                </span>
                {index < steps.length - 1 && (
                  <div className="w-12 h-0.5 mx-4 bg-muted" />
                )}
              </div>
            ))}
          </div>

          {error && (
            <Alert variant="destructive" className="mb-4">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Step content */}
          <Tabs value={currentStep} className="mt-4">
            <TabsList className="hidden">
              {steps.map((step) => (
                <TabsTrigger key={step.id} value={step.id}>
                  {step.title}
                </TabsTrigger>
              ))}
            </TabsList>

            <TabsContent value="basic" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="project">プロジェクト *</Label>
                <Select
                  id="project"
                  value={formData.project_id}
                  onChange={(e) =>
                    setFormData({ ...formData, project_id: e.target.value })
                  }
                >
                  <SelectOption value="">選択してください</SelectOption>
                  {projects.map((p) => (
                    <SelectOption key={p.id} value={p.id}>
                      {p.name}
                    </SelectOption>
                  ))}
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="name">Run名 *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="例: 訴求A vs B テスト"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="mode">運用モード</Label>
                <Select
                  id="mode"
                  value={formData.mode}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      mode: e.target.value as 'manual' | 'hybrid' | 'auto',
                    })
                  }
                >
                  <SelectOption value="manual">Manual（手動配信）</SelectOption>
                  <SelectOption value="hybrid">Hybrid（一部自動）</SelectOption>
                  <SelectOption value="auto">Auto（完全自動）</SelectOption>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Manual: 広告作成・配信は手動で行い、計測・判定をシステムが担当
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="budget">予算上限</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">¥</span>
                  <Input
                    id="budget"
                    type="number"
                    value={formData.budget_cap}
                    onChange={(e) =>
                      setFormData({ ...formData, budget_cap: Number(e.target.value) })
                    }
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="design" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="comparison">比較軸</Label>
                <Select
                  id="comparison"
                  value={formData.comparison_axis}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      comparison_axis: e.target.value as typeof formData.comparison_axis,
                    })
                  }
                >
                  <SelectOption value="intent">Intent（訴求）</SelectOption>
                  <SelectOption value="lp">LP差分</SelectOption>
                  <SelectOption value="banner">バナー差分</SelectOption>
                  <SelectOption value="combination">組み合わせ</SelectOption>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="metric">評価指標</Label>
                <Select
                  id="metric"
                  value={formData.target_metric}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      target_metric: e.target.value as typeof formData.target_metric,
                    })
                  }
                >
                  <SelectOption value="cvr">CVR（コンバージョン率）</SelectOption>
                  <SelectOption value="ctr">CTR（クリック率）</SelectOption>
                  <SelectOption value="cpa">CPA（獲得単価）</SelectOption>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="sample">最低サンプルサイズ</Label>
                <Input
                  id="sample"
                  type="number"
                  value={formData.min_sample_size}
                  onChange={(e) =>
                    setFormData({ ...formData, min_sample_size: Number(e.target.value) })
                  }
                />
                <p className="text-xs text-muted-foreground">
                  統計的有意性を判断するための最低クリック数
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="threshold">勝ち判定閾値</Label>
                <Select
                  id="threshold"
                  value={String(formData.winning_threshold)}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      winning_threshold: Number(e.target.value),
                    })
                  }
                >
                  <SelectOption value="0.9">90%</SelectOption>
                  <SelectOption value="0.95">95%（推奨）</SelectOption>
                  <SelectOption value="0.99">99%</SelectOption>
                </Select>
              </div>
            </TabsContent>

            <TabsContent value="stop-rules" className="space-y-4">
              <p className="text-sm text-muted-foreground mb-4">
                以下の条件に達した場合、自動的に配信を停止します
              </p>

              <div className="space-y-2">
                <Label htmlFor="spend-cap">予算上限</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">¥</span>
                  <Input
                    id="spend-cap"
                    type="number"
                    value={formData.spend_total_cap}
                    onChange={(e) =>
                      setFormData({ ...formData, spend_total_cap: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cpa-cap">CPA上限</Label>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">¥</span>
                  <Input
                    id="cpa-cap"
                    type="number"
                    value={formData.cpa_cap}
                    onChange={(e) =>
                      setFormData({ ...formData, cpa_cap: Number(e.target.value) })
                    }
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  CPAがこの値を超えた場合に停止
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="cv-zero">CV未発生時間</Label>
                <div className="flex items-center gap-2">
                  <Input
                    id="cv-zero"
                    type="number"
                    value={formData.cv_zero_duration}
                    onChange={(e) =>
                      setFormData({ ...formData, cv_zero_duration: Number(e.target.value) })
                    }
                  />
                  <span className="text-muted-foreground">時間</span>
                </div>
                <p className="text-xs text-muted-foreground">
                  指定時間CVが発生しない場合に停止
                </p>
              </div>
            </TabsContent>

            <TabsContent value="review" className="space-y-4">
              <div className="rounded-lg border p-4 space-y-4">
                <h3 className="font-semibold">基本情報</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">プロジェクト</dt>
                  <dd>{projects.find((p) => p.id === formData.project_id)?.name}</dd>
                  <dt className="text-muted-foreground">Run名</dt>
                  <dd>{formData.name}</dd>
                  <dt className="text-muted-foreground">運用モード</dt>
                  <dd className="capitalize">{formData.mode}</dd>
                  <dt className="text-muted-foreground">予算上限</dt>
                  <dd>¥{formData.budget_cap.toLocaleString()}</dd>
                </dl>

                <h3 className="font-semibold pt-4">テスト設計</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">比較軸</dt>
                  <dd>{formData.comparison_axis}</dd>
                  <dt className="text-muted-foreground">評価指標</dt>
                  <dd>{formData.target_metric.toUpperCase()}</dd>
                  <dt className="text-muted-foreground">最低サンプル</dt>
                  <dd>{formData.min_sample_size}</dd>
                  <dt className="text-muted-foreground">勝ち判定閾値</dt>
                  <dd>{(formData.winning_threshold * 100).toFixed(0)}%</dd>
                </dl>

                <h3 className="font-semibold pt-4">停止条件</h3>
                <dl className="grid grid-cols-2 gap-2 text-sm">
                  <dt className="text-muted-foreground">予算上限</dt>
                  <dd>¥{formData.spend_total_cap.toLocaleString()}</dd>
                  <dt className="text-muted-foreground">CPA上限</dt>
                  <dd>¥{formData.cpa_cap.toLocaleString()}</dd>
                  <dt className="text-muted-foreground">CV未発生停止</dt>
                  <dd>{formData.cv_zero_duration}時間</dd>
                </dl>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>

        <CardFooter className="flex justify-between">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={currentStepIndex === 0}
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            戻る
          </Button>

          {currentStep === 'review' ? (
            <Button onClick={handleSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? '作成中...' : 'Runを作成'}
            </Button>
          ) : (
            <Button onClick={handleNext}>
              次へ
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
    </div>
  );
}
