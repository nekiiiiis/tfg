import { Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { Activity, Bell, Users } from 'lucide-react';
import LeaderboardPage from './pages/LeaderboardPage';
import EntidadesPage from './pages/EntidadesPage';
import EntidadDetailPage from './pages/EntidadDetailPage';
import DireccionDetailPage from './pages/DireccionDetailPage';
import AlertasPage from './pages/AlertasPage';
import HealthIndicator from './components/HealthIndicator';
import { cn } from './core/cn';

const NAV = [
  { to: '/leaderboard', label: 'Leaderboard', icon: Activity },
  { to: '/entidades', label: 'Entidades', icon: Users },
  { to: '/alertas', label: 'Alertas', icon: Bell },
] as const;

export default function App() {
  return (
    <div className="flex h-full min-h-screen flex-col">
      <header className="border-b border-border bg-card/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1600px] items-center gap-6 px-6">
          <div className="flex items-center gap-2 font-semibold tracking-tight">
            <span className="bg-linear-to-r from-primary to-accent bg-clip-text text-transparent">
              Infinite Fieldx
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              Hyperliquid · Realtime
            </span>
          </div>
          <nav className="flex items-center gap-1">
            {NAV.map(({ to, label, icon: Icon }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors',
                    isActive
                      ? 'bg-primary/15 text-primary'
                      : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                  )
                }
              >
                <Icon className="h-4 w-4" />
                {label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto">
            <HealthIndicator />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[1600px] flex-1 px-6 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/leaderboard" replace />} />
          <Route path="/leaderboard" element={<LeaderboardPage />} />
          <Route path="/entidades" element={<EntidadesPage />} />
          <Route path="/entidades/:id" element={<EntidadDetailPage />} />
          <Route
            path="/direcciones/:addr"
            element={<DireccionDetailPage />}
          />
          <Route path="/alertas" element={<AlertasPage />} />
          <Route path="*" element={<Navigate to="/leaderboard" replace />} />
        </Routes>
      </main>
      <footer className="border-t border-border bg-card/40 py-3 text-center text-xs text-muted-foreground">
        TFG · Infinite Fieldx · Hyperliquid L1
      </footer>
    </div>
  );
}
