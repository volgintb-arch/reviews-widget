import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, FolderOpen } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { listProjects, createProject, updateProject, deleteProject, type Project } from '@/api/projects';
import { useProjectContext } from '@/lib/project-context';

export default function Projects() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentSlug, setCurrentSlug } = useProjectContext();
  const { data: projects, isLoading } = useQuery({ queryKey: ['projects'], queryFn: listProjects });

  const createMut = useMutation({
    mutationFn: createProject,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); toast({ title: 'Проект создан' }); },
    onError: (err: any) => toast({ title: err?.response?.data?.error ?? 'Ошибка', variant: 'destructive' }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['projects'] }); toast({ title: 'Проект удалён' }); },
    onError: (err: any) => toast({
      title: err?.response?.data?.error ?? 'Ошибка удаления',
      variant: 'destructive',
    }),
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Проекты</h2>
          <p className="text-sm text-muted-foreground">
            Каждый проект — отдельный виджет со своими настройками и списком городов
          </p>
        </div>
        <CreateProjectDialog onCreate={(body) => createMut.mutate(body)} />
      </div>

      {isLoading ? (
        <div className="space-y-2">{[1, 2].map((i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
      ) : !projects || projects.length === 0 ? (
        <Card><CardContent className="py-12 text-center text-muted-foreground">Нет проектов</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              project={p}
              isCurrent={p.slug === currentSlug}
              onSelect={() => setCurrentSlug(p.slug)}
              onDelete={() => deleteMut.mutate(p.slug)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectRow({ project, isCurrent, onSelect, onDelete }: {
  project: Project;
  isCurrent: boolean;
  onSelect: () => void;
  onDelete: () => void;
}) {
  return (
    <Card className={isCurrent ? 'border-primary' : ''}>
      <CardContent className="flex items-center justify-between py-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <FolderOpen className="h-4 w-4 text-muted-foreground shrink-0" />
            <h3 className="font-semibold truncate">{project.name}</h3>
            {isCurrent && <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">Активный</span>}
          </div>
          <div className="mt-1 flex gap-3 text-xs text-muted-foreground">
            <span className="font-mono">{project.slug}</span>
            <span>·</span>
            <span>{project.cities_count} городов</span>
          </div>
          {project.description && <p className="mt-2 text-sm text-muted-foreground">{project.description}</p>}
        </div>
        <div className="flex gap-1 shrink-0">
          {!isCurrent && (
            <Button variant="outline" size="sm" onClick={onSelect}>Выбрать</Button>
          )}
          <EditProjectDialog project={project} />
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button variant="ghost" size="icon" disabled={project.cities_count > 0}>
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Удалить проект «{project.name}»?</AlertDialogTitle>
                <AlertDialogDescription>
                  Действие нельзя отменить. Удалить можно только проект без городов.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Отмена</AlertDialogCancel>
                <AlertDialogAction onClick={onDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                  Удалить
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </CardContent>
    </Card>
  );
}

function CreateProjectDialog({ onCreate }: { onCreate: (body: { slug: string; name: string; description?: string }) => void }) {
  const [open, setOpen] = useState(false);
  const [slug, setSlug] = useState('');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!slug || !name) return;
    onCreate({ slug, name, description: description || undefined });
    setSlug(''); setName(''); setDescription('');
    setOpen(false);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="mr-2 h-4 w-4" />Новый проект</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Новый проект</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Slug *</Label>
            <Input value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="my-project" pattern="[a-z0-9-]+" required />
            <p className="text-xs text-muted-foreground">Латиница, цифры, дефис. Используется в embed-коде виджета.</p>
          </div>
          <div className="space-y-2">
            <Label>Название *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Мой проект" required />
          </div>
          <div className="space-y-2">
            <Label>Описание</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Короткое описание" />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit">Создать</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function EditProjectDialog({ project }: { project: Project }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description ?? '');

  const updateMut = useMutation({
    mutationFn: (body: { name: string; description: string }) => updateProject(project.slug, body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      toast({ title: 'Сохранено' });
      setOpen(false);
    },
    onError: () => toast({ title: 'Ошибка', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="ghost" size="icon"><Pencil className="h-4 w-4" /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Редактировать проект</DialogTitle></DialogHeader>
        <form onSubmit={(e) => { e.preventDefault(); updateMut.mutate({ name, description }); }} className="space-y-4">
          <div className="space-y-2">
            <Label>Slug (нельзя изменить)</Label>
            <Input value={project.slug} disabled />
          </div>
          <div className="space-y-2">
            <Label>Название</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Описание</Label>
            <Input value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>Отмена</Button>
            <Button type="submit" disabled={updateMut.isPending}>Сохранить</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
