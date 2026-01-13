import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
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
import { projectsApi } from '@/api';
import { Plus, FolderKanban } from 'lucide-react';

export function ProjectListPage() {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectsApi.list(),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">プロジェクト</h1>
          <p className="text-muted-foreground">
            ローンチテストのプロジェクトを管理
          </p>
        </div>
        <Link to="/projects/new">
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            新規プロジェクト
          </Button>
        </Link>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>プロジェクト一覧</CardTitle>
          <CardDescription>
            登録されているすべてのプロジェクト
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">
              読み込み中...
            </div>
          ) : projects.length === 0 ? (
            <div className="text-center py-8">
              <FolderKanban className="mx-auto h-12 w-12 text-muted-foreground" />
              <h3 className="mt-4 text-lg font-semibold">プロジェクトがありません</h3>
              <p className="mt-2 text-muted-foreground">
                最初のプロジェクトを作成して始めましょう
              </p>
              <Link to="/projects/new">
                <Button className="mt-4">
                  <Plus className="mr-2 h-4 w-4" />
                  プロジェクトを作成
                </Button>
              </Link>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>プロジェクト名</TableHead>
                  <TableHead>説明</TableHead>
                  <TableHead>ステータス</TableHead>
                  <TableHead>作成日</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {projects.map((project) => {
                  const createdAt = project.created_at ?? project.createdAt;
                  // archivedAtがnull/undefinedならアクティブ、それ以外はアーカイブ
                  const isActive = project.archivedAt == null && (project.status == null || ['active', 'Active'].includes(project.status));
                  return (
                    <TableRow key={project.id}>
                      <TableCell>
                        <Link
                          to={`/projects/${project.id}`}
                          className="font-medium hover:underline"
                        >
                          {project.name}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground max-w-xs truncate">
                        {project.description || '-'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={isActive ? 'default' : 'secondary'}
                        >
                          {isActive ? 'アクティブ' : 'アーカイブ'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {createdAt ? new Date(createdAt).toLocaleDateString('ja-JP') : '-'}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
