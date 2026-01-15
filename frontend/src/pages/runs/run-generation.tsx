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
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell,
} from '@/components/ui';
import { runsApi, intentsApi, generationApi } from '@/api';
import {
  ArrowLeft,
  Play,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  FileText,
  Image,
  MessageSquare,
} from 'lucide-react';
import type { Job, JobStatus } from '@/types';

const jobStatusLabels: Record<JobStatus, { label: string; color: string }> = {
  queued: { label: 'Queued', color: 'bg-gray-100 text-gray-800' },
  running: { label: 'Running', color: 'bg-blue-100 text-blue-800' },
  succeeded: { label: 'Succeeded', color: 'bg-green-100 text-green-800' },
  failed: { label: 'Failed', color: 'bg-red-100 text-red-800' },
  cancelled: { label: 'Cancelled', color: 'bg-gray-100 text-gray-800' },
};

const JobStatusIcon = ({ status }: { status: JobStatus }) => {
  switch (status) {
    case 'queued':
      return <Clock className="h-4 w-4 text-gray-500" />;
    case 'running':
      return <Loader2 className="h-4 w-4 text-blue-500 animate-spin" />;
    case 'succeeded':
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case 'failed':
      return <XCircle className="h-4 w-4 text-red-500" />;
    case 'cancelled':
      return <XCircle className="h-4 w-4 text-gray-500" />;
    default:
      return null;
  }
};

export function RunGenerationPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [generateOptions, setGenerateOptions] = useState({
    lp: true,
    banner: true,
    adCopy: true,
    lpCount: 3,
    bannerCount: 3,
    adCopyCount: 3,
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

  const { data: jobs = [], isLoading: jobsLoading } = useQuery({
    queryKey: ['runs', id, 'jobs'],
    queryFn: () => generationApi.listJobs(id!),
    enabled: !!id,
    refetchInterval: 5000, // Poll every 5 seconds for active jobs
  });

  const generateMutation = useMutation({
    mutationFn: () =>
      generationApi.generate(id!, {
        targets: {
          lp: generateOptions.lp,
          banner: generateOptions.banner,
          adCopy: generateOptions.adCopy,
        },
        options: {
          lpCount: generateOptions.lpCount,
          bannerCount: generateOptions.bannerCount,
          adCopyCount: generateOptions.adCopyCount,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id, 'jobs'] });
    },
  });

  const retryJobMutation = useMutation({
    mutationFn: (jobId: string) => generationApi.retryJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id, 'jobs'] });
    },
  });

  const cancelJobMutation = useMutation({
    mutationFn: (jobId: string) => generationApi.cancelJob(jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['runs', id, 'jobs'] });
    },
  });

  if (runLoading) {
    return <div className="text-center py-8 text-muted-foreground">Loading...</div>;
  }

  if (!run) {
    return (
      <div className="text-center py-8">
        <p className="text-muted-foreground">Run not found</p>
        <Button className="mt-4" onClick={() => navigate('/runs')}>
          Back to Runs
        </Button>
      </div>
    );
  }

  const activeJobs = jobs.filter((j) => j.status === 'queued' || j.status === 'running');
  const completedJobs = jobs.filter((j) => j.status === 'succeeded' || j.status === 'failed');
  const hasActiveJobs = activeJobs.length > 0;

  const getJobResult = (job: Job) => {
    const result = job.result_json as {
      lpVariants?: { id: string; name: string }[];
      creativeVariants?: { id: string; name: string; size: string }[];
      adCopies?: { id: string; headline: string }[];
    };
    return result;
  };

  return (
    <div className="space-y-6">
      <Button variant="ghost" onClick={() => navigate(`/runs/${id}`)}>
        <ArrowLeft className="mr-2 h-4 w-4" />
        Back to Run
      </Button>

      <div>
        <h1 className="text-3xl font-bold tracking-tight">Generate Content</h1>
        <p className="text-muted-foreground mt-2">
          Generate LP, Banner, and Ad Copy for {run.name}
        </p>
      </div>

      {/* Generation Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Generation Options</CardTitle>
          <CardDescription>Select what to generate for each intent</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-6 md:grid-cols-3">
            {/* LP Options */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="generate-lp"
                  checked={generateOptions.lp}
                  onChange={(e) =>
                    setGenerateOptions({ ...generateOptions, lp: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="generate-lp" className="flex items-center gap-2 font-medium">
                  <FileText className="h-5 w-5" />
                  Landing Pages
                </label>
              </div>
              {generateOptions.lp && (
                <div className="ml-7">
                  <label className="text-sm text-muted-foreground">
                    Variants per intent
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={generateOptions.lpCount}
                    onChange={(e) =>
                      setGenerateOptions({
                        ...generateOptions,
                        lpCount: Number(e.target.value),
                      })
                    }
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              )}
            </div>

            {/* Banner Options */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="generate-banner"
                  checked={generateOptions.banner}
                  onChange={(e) =>
                    setGenerateOptions({ ...generateOptions, banner: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="generate-banner" className="flex items-center gap-2 font-medium">
                  <Image className="h-5 w-5" />
                  Banners
                </label>
              </div>
              {generateOptions.banner && (
                <div className="ml-7">
                  <label className="text-sm text-muted-foreground">
                    Variants per intent (per size)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={generateOptions.bannerCount}
                    onChange={(e) =>
                      setGenerateOptions({
                        ...generateOptions,
                        bannerCount: Number(e.target.value),
                      })
                    }
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              )}
            </div>

            {/* Ad Copy Options */}
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="generate-adcopy"
                  checked={generateOptions.adCopy}
                  onChange={(e) =>
                    setGenerateOptions({ ...generateOptions, adCopy: e.target.checked })
                  }
                  className="h-4 w-4"
                />
                <label htmlFor="generate-adcopy" className="flex items-center gap-2 font-medium">
                  <MessageSquare className="h-5 w-5" />
                  Ad Copies
                </label>
              </div>
              {generateOptions.adCopy && (
                <div className="ml-7">
                  <label className="text-sm text-muted-foreground">
                    Variants per intent
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={10}
                    value={generateOptions.adCopyCount}
                    onChange={(e) =>
                      setGenerateOptions({
                        ...generateOptions,
                        adCopyCount: Number(e.target.value),
                      })
                    }
                    className="w-full mt-1 px-3 py-2 border rounded-md"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {intents.length} intents selected
            </div>
            <Button
              onClick={() => generateMutation.mutate()}
              disabled={
                generateMutation.isPending ||
                hasActiveJobs ||
                (!generateOptions.lp && !generateOptions.banner && !generateOptions.adCopy)
              }
            >
              {generateMutation.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Play className="mr-2 h-4 w-4" />
              )}
              Start Generation
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Jobs */}
      {hasActiveJobs && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Loader2 className="h-5 w-5 animate-spin" />
              Active Jobs
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeJobs.map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-4 border rounded-lg"
                >
                  <div className="flex items-center gap-4">
                    <JobStatusIcon status={job.status} />
                    <div>
                      <p className="font-medium">{job.job_type}</p>
                      <p className="text-sm text-muted-foreground">
                        Started: {new Date(job.created_at).toLocaleString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge className={jobStatusLabels[job.status].color}>
                      {jobStatusLabels[job.status].label}
                    </Badge>
                    {job.status === 'queued' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => cancelJobMutation.mutate(job.id)}
                        disabled={cancelJobMutation.isPending}
                      >
                        Cancel
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Job History */}
      <Card>
        <CardHeader>
          <CardTitle>Generation History</CardTitle>
          <CardDescription>Past generation jobs and their results</CardDescription>
        </CardHeader>
        <CardContent>
          {jobsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Loading jobs...</div>
          ) : jobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No generation jobs yet. Start one above.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Status</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead>Results</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {jobs.map((job) => {
                  const result = getJobResult(job);
                  return (
                    <TableRow key={job.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <JobStatusIcon status={job.status} />
                          <Badge className={jobStatusLabels[job.status].color}>
                            {jobStatusLabels[job.status].label}
                          </Badge>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">{job.job_type}</TableCell>
                      <TableCell>{new Date(job.created_at).toLocaleString()}</TableCell>
                      <TableCell>
                        {job.status === 'succeeded' ? (
                          <div className="text-sm space-y-1">
                            {result?.lpVariants && (
                              <p>{result.lpVariants.length} LP variants</p>
                            )}
                            {result?.creativeVariants && (
                              <p>{result.creativeVariants.length} banners</p>
                            )}
                            {result?.adCopies && (
                              <p>{result.adCopies.length} ad copies</p>
                            )}
                          </div>
                        ) : job.status === 'failed' ? (
                          <span className="text-sm text-red-600">{job.last_error || 'Unknown error'}</span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                      <TableCell>
                        {job.status === 'failed' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => retryJobMutation.mutate(job.id)}
                            disabled={retryJobMutation.isPending}
                          >
                            <RefreshCw className="mr-2 h-4 w-4" />
                            Retry
                          </Button>
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

      {/* Generated Content Preview */}
      {completedJobs.some((j) => j.status === 'succeeded') && (
        <Card>
          <CardHeader>
            <CardTitle>Generated Content</CardTitle>
            <CardDescription>Preview and edit generated content</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 md:grid-cols-3">
              <div className="p-4 border rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <FileText className="h-4 w-4" />
                  Landing Pages
                </h4>
                <p className="text-2xl font-bold">
                  {completedJobs
                    .filter((j) => j.status === 'succeeded')
                    .reduce((acc, j) => acc + (getJobResult(j)?.lpVariants?.length || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">variants generated</p>
                <Button variant="outline" className="w-full mt-3" onClick={() => navigate(`/runs/${id}/lp-editor`)}>
                  Edit LPs
                </Button>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <Image className="h-4 w-4" />
                  Banners
                </h4>
                <p className="text-2xl font-bold">
                  {completedJobs
                    .filter((j) => j.status === 'succeeded')
                    .reduce((acc, j) => acc + (getJobResult(j)?.creativeVariants?.length || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">variants generated</p>
                <Button variant="outline" className="w-full mt-3" onClick={() => navigate(`/runs/${id}/creative-editor`)}>
                  Edit Banners
                </Button>
              </div>

              <div className="p-4 border rounded-lg">
                <h4 className="font-medium flex items-center gap-2 mb-3">
                  <MessageSquare className="h-4 w-4" />
                  Ad Copies
                </h4>
                <p className="text-2xl font-bold">
                  {completedJobs
                    .filter((j) => j.status === 'succeeded')
                    .reduce((acc, j) => acc + (getJobResult(j)?.adCopies?.length || 0), 0)}
                </p>
                <p className="text-sm text-muted-foreground">variants generated</p>
                <Button variant="outline" className="w-full mt-3" onClick={() => navigate(`/runs/${id}/intents`)}>
                  Edit Ad Copies
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
