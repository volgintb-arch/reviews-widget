import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { listProjects, type Project } from '@/api/projects';
import { getToken } from '@/lib/auth';

interface ProjectContextValue {
  projects: Project[];
  currentSlug: string;
  current: Project | undefined;
  setCurrentSlug: (slug: string) => void;
  isLoading: boolean;
}

const ProjectContext = createContext<ProjectContextValue | undefined>(undefined);

const STORAGE_KEY = 'admin:current-project';
const DEFAULT_SLUG = 'reviews';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const { data: projects = [], isLoading } = useQuery({
    queryKey: ['projects'],
    queryFn: listProjects,
    staleTime: 30_000,
    enabled: !!getToken(),
  });

  const [currentSlug, setCurrentSlugState] = useState<string>(() => {
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_SLUG;
  });

  // If persisted slug no longer exists, fall back to first project
  useEffect(() => {
    if (!isLoading && projects.length > 0 && !projects.some((p) => p.slug === currentSlug)) {
      setCurrentSlugState(projects[0].slug);
    }
  }, [projects, isLoading, currentSlug]);

  function setCurrentSlug(slug: string) {
    localStorage.setItem(STORAGE_KEY, slug);
    setCurrentSlugState(slug);
  }

  const current = projects.find((p) => p.slug === currentSlug);

  return (
    <ProjectContext.Provider value={{ projects, currentSlug, current, setCurrentSlug, isLoading }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProjectContext() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProjectContext must be used within ProjectProvider');
  return ctx;
}
