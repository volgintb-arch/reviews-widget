import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { LayoutDashboard, MapPin, MessageSquare, Settings, LogOut, Bell, FolderOpen } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { clearToken } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { getUnreadCount } from '@/api/alerts';
import { useProjectContext } from '@/lib/project-context';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', end: true },
  { to: '/projects', icon: FolderOpen, label: 'Проекты' },
  { to: '/cities', icon: MapPin, label: 'Города' },
  { to: '/reviews', icon: MessageSquare, label: 'Отзывы' },
  { to: '/alerts', icon: Bell, label: 'Алерты', badgeKey: 'alerts' as const },
  { to: '/settings', icon: Settings, label: 'Настройки' },
];

export function Layout() {
  const navigate = useNavigate();
  const { projects, currentSlug, setCurrentSlug } = useProjectContext();

  const { data: unreadAlerts = 0 } = useQuery({
    queryKey: ['alerts-unread-count'],
    queryFn: getUnreadCount,
    refetchInterval: 60_000,
  });

  function handleLogout() {
    clearToken();
    navigate('/login');
  }

  return (
    <div className="flex h-screen">
      <aside className="hidden w-56 shrink-0 border-r bg-muted/30 md:block">
        <div className="flex h-14 items-center border-b px-4 font-semibold">Reviews Admin</div>
        <div className="border-b p-3">
          <label className="mb-1 block text-xs font-medium text-muted-foreground">Проект</label>
          <Select value={currentSlug} onValueChange={setCurrentSlug}>
            <SelectTrigger className="h-9"><SelectValue placeholder="Выберите проект" /></SelectTrigger>
            <SelectContent>
              {projects.map((p) => (
                <SelectItem key={p.slug} value={p.slug}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <nav className="flex flex-col gap-1 p-2">
          {navItems.map(({ to, icon: Icon, label, end, badgeKey }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors hover:bg-muted',
                  isActive && 'bg-muted text-foreground'
                )
              }
            >
              <Icon className="h-4 w-4" />
              <span className="flex-1">{label}</span>
              {badgeKey === 'alerts' && unreadAlerts > 0 && (
                <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-semibold text-white">
                  {unreadAlerts > 99 ? '99+' : unreadAlerts}
                </span>
              )}
            </NavLink>
          ))}
        </nav>
      </aside>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center justify-between border-b px-4 md:px-6">
          <h1 className="text-lg font-semibold md:hidden">Reviews Admin</h1>
          <div className="ml-auto">
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="mr-2 h-4 w-4" />
              Выйти
            </Button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
