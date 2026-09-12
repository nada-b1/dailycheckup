'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, Calendar as CalendarIcon, Loader2, ListTodo, AlertTriangle, CheckSquare, Activity, Users,
  Terminal, Zap, Coffee, Gamepad2, Palette, Book, 
  Target, Flame, Brain, Rocket, Trophy, Compass, 
  Shield, Heart, Sparkles, Code
} from 'lucide-react';
import { Task, User } from '@/lib/db';
import { TaskCard } from '@/components/TaskCard';
import { ContributionHeatmap } from '@/components/ContributionHeatmap';

// Local avatar mapper for emoji-free design
const AVATAR_MAP: Record<string, React.ComponentType<{ className?: string; strokeWidth?: number }>> = {
  '💻': Terminal,
  '⚡': Zap,
  '☕': Coffee,
  '🎮': Gamepad2,
  '🎨': Palette,
  '📚': Book,
  '🎯': Target,
  '🔥': Flame,
  '🧠': Brain,
  '🚀': Rocket,
  '🍕': Trophy,
  '🦁': Compass,
  '🐱': Shield,
  '🐼': Heart,
  '🦊': Sparkles,
  '🦖': Code,
  'terminal': Terminal,
  'zap': Zap,
  'coffee': Coffee,
  'gamepad': Gamepad2,
  'palette': Palette,
  'book': Book,
  'target': Target,
  'flame': Flame,
  'brain': Brain,
  'rocket': Rocket,
  'trophy': Trophy,
  'compass': Compass,
  'shield': Shield,
  'heart': Heart,
  'sparkles': Sparkles,
  'code': Code,
};

// Premium desaturated color palettes
const COLOR_THEMES: Record<string, { headerBg: string; border: string; text: string; shadow: string; glow: string; badge: string }> = {
  indigo: {
    headerBg: 'bg-indigo-950/10 border-indigo-500/20 text-indigo-400',
    border: 'border-indigo-500/20',
    text: 'text-indigo-400',
    shadow: 'rgba(99, 102, 241, 0.08)',
    glow: 'from-indigo-500/10 via-indigo-500/2 to-transparent',
    badge: 'bg-indigo-500/5 text-indigo-300 border-indigo-500/15',
  },
  rose: {
    headerBg: 'bg-rose-950/10 border-rose-500/20 text-rose-400',
    border: 'border-rose-500/20',
    text: 'text-rose-400',
    shadow: 'rgba(244, 63, 94, 0.08)',
    glow: 'from-rose-500/10 via-rose-500/2 to-transparent',
    badge: 'bg-rose-500/5 text-rose-300 border-rose-500/15',
  },
  emerald: {
    headerBg: 'bg-emerald-950/10 border-emerald-500/20 text-emerald-400',
    border: 'border-emerald-500/20',
    text: 'text-emerald-400',
    shadow: 'rgba(16, 185, 129, 0.08)',
    glow: 'from-emerald-500/10 via-emerald-500/2 to-transparent',
    badge: 'bg-emerald-500/5 text-emerald-300 border-emerald-500/15',
  },
  amber: {
    headerBg: 'bg-amber-950/10 border-amber-500/20 text-amber-400',
    border: 'border-amber-500/20',
    text: 'text-amber-400',
    shadow: 'rgba(245, 158, 11, 0.08)',
    glow: 'from-amber-500/10 via-amber-500/2 to-transparent',
    badge: 'bg-amber-500/5 text-amber-300 border-amber-500/15',
  },
  purple: {
    headerBg: 'bg-purple-950/10 border-purple-500/20 text-purple-400',
    border: 'border-purple-500/20',
    text: 'text-purple-400',
    shadow: 'rgba(168, 85, 247, 0.08)',
    glow: 'from-purple-500/10 via-purple-500/2 to-transparent',
    badge: 'bg-purple-500/5 text-purple-300 border-purple-500/15',
  },
  cyan: {
    headerBg: 'bg-cyan-950/10 border-cyan-500/20 text-cyan-400',
    border: 'border-cyan-500/20',
    text: 'text-cyan-400',
    shadow: 'rgba(6, 182, 212, 0.08)',
    glow: 'from-cyan-500/10 via-cyan-500/2 to-transparent',
    badge: 'bg-cyan-500/5 text-cyan-300 border-cyan-500/15',
  },
};

export default function History() {
  const router = useRouter();
  
  // Shifted Algiers Today as maximum allowed date
  const getShiftedAlgiersTodayString = (): string => {
    const now = new Date();
    now.setHours(now.getHours() - 4);
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Algiers',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(now);
    } catch {
      return now.toISOString().split('T')[0];
    }
  };

  // Yesterday's date as default (shifted Algiers time - 28 hours)
  const getShiftedAlgiersYesterdayString = (): string => {
    const now = new Date();
    now.setHours(now.getHours() - 28);
    try {
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Africa/Algiers',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
      return formatter.format(now);
    } catch {
      return now.toISOString().split('T')[0];
    }
  };

  const [currentUser, setCurrentUser] = useState<Omit<User, 'pin'> | null>(null);
  const [selectedDate, setSelectedDate] = useState(getShiftedAlgiersYesterdayString());
  const [users, setUsers] = useState<Omit<User, 'pin'>[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeMobileUserId, setActiveMobileUserId] = useState<string | null>(null);

  // Heatmap state: sparse map of YYYY-MM-DD → completed task count
  const [heatmapCounts, setHeatmapCounts] = useState<Record<string, number>>({});
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // Fetch Board details for selected date
  const fetchHistoryBoard = useCallback(async (dateStr: string) => {
    setLoading(true);
    try {
      // 1. Verify User Profile
      if (!currentUser) {
        const authRes = await fetch('/api/auth/me');
        if (!authRes.ok) {
          router.push('/');
          return;
        }
        const authData = await authRes.json();
        setCurrentUser(authData.user);
        
        if (!activeMobileUserId) {
          setActiveMobileUserId(authData.user.id);
        }
      }

      // 2. Fetch Board State for dateStr
      const boardRes = await fetch(`/api/board?date=${dateStr}`);
      if (boardRes.ok) {
        const boardData = await boardRes.json();
        setUsers(boardData.users);
        setTasks(boardData.tasks);
      }
    } catch (e) {
      console.error('Error fetching history board:', e);
    } finally {
      setLoading(false);
    }
  }, [currentUser, activeMobileUserId, router]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchHistoryBoard(selectedDate);
    }, 0);
    return () => clearTimeout(timer);
  }, [selectedDate, fetchHistoryBoard]);

  // Fetch heatmap once the current user is known
  useEffect(() => {
    if (!currentUser) return;
    let cancelled = false;
    async function fetchHeatmap() {
      setHeatmapLoading(true);
      try {
        const res = await fetch(`/api/heatmap?userId=${currentUser!.id}&months=12`);
        if (res.ok && !cancelled) {
          const data = await res.json();
          setHeatmapCounts(data.counts ?? {});
        }
      } catch (e) {
        console.error('Failed to load heatmap data', e);
      } finally {
        if (!cancelled) setHeatmapLoading(false);
      }
    }
    fetchHeatmap();
    return () => { cancelled = true; };
  }, [currentUser]);

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.value) {
      setSelectedDate(e.target.value);
    }
  };

  // Helper placeholder update functions for Read-Only cards
  const noopUpdate = async (id: string, updates: Partial<Pick<Task, 'status' | 'text'>>) => {
    void id;
    void updates;
  };
  const noopDelete = async (id: string) => {
    void id;
  };

  // Stats calculation
  const totalTasksCount = tasks.length;
  const completedTasksCount = tasks.filter(t => t.status === 'done').length;
  const workingTasksCount = tasks.filter(t => t.status === 'working').length;
  const groupCompletionRate = totalTasksCount > 0 ? Math.round((completedTasksCount / totalTasksCount) * 100) : 0;
  const activeMembersToday = users.filter(u => tasks.some(t => t.userId === u.id)).length;

  return (
    <div className="flex flex-col min-h-[100dvh] bg-[#050505] text-zinc-100 pb-20 relative overflow-hidden">
      {/* Background Noise & Glowing Mesh Orbs */}
      <div className="noise-overlay" />
      <div className="absolute top-[10%] left-[20%] w-[35vw] h-[35vw] max-w-[500px] max-h-[500px] bg-indigo-950/5 rounded-full blur-[130px] pointer-events-none animate-float-slow" />
      <div className="absolute bottom-[20%] right-[10%] w-[40vw] h-[40vw] max-w-[550px] max-h-[550px] bg-violet-950/5 rounded-full blur-[140px] pointer-events-none animate-float-slow" style={{ animationDelay: '-4s' }} />

      {/* Floating Glass Pill Navbar */}
      <header className="px-4 pt-6 pb-2 w-full max-w-[1400px] mx-auto z-40">
        <div className="glass-panel rounded-full px-4 sm:px-6 py-3 flex items-center justify-between border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.6)]">
          {/* Back to Board Button */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push('/board')}
              className="p-1.5 rounded-full border border-white/5 bg-white/5 hover:bg-white/10 text-zinc-300 hover:text-white transition-all cursor-pointer flex items-center justify-center active:scale-95"
            >
              <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.5} />
            </button>
            <div className="hidden xs:block">
              <h1 className="text-sm font-semibold tracking-tight text-white font-sans flex items-center gap-2">
                History Archive
              </h1>
            </div>
          </div>

          {/* Date selection & calendar picker */}
          <div className="flex items-center gap-3">
            <div className="relative flex items-center bg-[#050505]/60 border border-white/5 rounded-full px-4 py-1.5 text-[10px] font-semibold tracking-wider font-sans uppercase">
              <CalendarIcon className="w-3.5 h-3.5 text-zinc-400 mr-2" strokeWidth={1.5} />
              <span className="text-zinc-500 mr-2 hidden sm:inline">Select:</span>
              <input
                type="date"
                value={selectedDate}
                onChange={handleDateChange}
                max={getShiftedAlgiersTodayString()}
                className="bg-transparent text-zinc-200 border-none outline-none focus:ring-0 font-bold cursor-pointer text-[10px] p-0"
                style={{ colorScheme: 'dark' }}
              />
            </div>
          </div>
        </div>
      </header>

      {/* Main Board Layout */}
      <main className="max-w-[1400px] w-full mx-auto px-4 mt-6 flex-1 flex flex-col z-10">

        {/* ── Contribution Heatmap ── */}
        {heatmapLoading ? (
          // Skeleton shimmer while data loads
          <div className="double-bezel-outer rounded-[1.75rem] p-1 mb-8 animate-pulse">
            <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 sm:p-6">
              <div className="h-4 w-40 bg-white/5 rounded-lg mb-4" />
              <div className="h-[92px] w-full bg-white/[0.03] rounded-xl" />
            </div>
          </div>
        ) : (
          <ContributionHeatmap
            counts={heatmapCounts}
            months={12}
            userColor={currentUser?.color ?? 'indigo'}
          />
        )}

        {/* Bento Stats Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
          {/* Card 1: Completion rate progress */}
          <div className="double-bezel-outer rounded-[1.75rem] p-1">
            <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                <CheckSquare className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <span className="block text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Day Progress</span>
                <span className="block text-xl font-bold tracking-tight text-white font-mono mt-0.5">{groupCompletionRate}%</span>
                <div className="w-full bg-white/5 h-1.5 rounded-full mt-2 overflow-hidden border border-white/5">
                  <div 
                    className="bg-indigo-500 h-full rounded-full transition-all duration-700 ease-out" 
                    style={{ width: `${groupCompletionRate}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Card 2: Status breakdown */}
          <div className="double-bezel-outer rounded-[1.75rem] p-1">
            <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
                <Activity className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <span className="block text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Day Velocity</span>
                <span className="block text-xl font-bold tracking-tight text-white font-mono mt-0.5">
                  {completedTasksCount} / {totalTasksCount} Done
                </span>
                <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                  {workingTasksCount} tasks ended in working state
                </p>
              </div>
            </div>
          </div>

          {/* Card 3: Board Stats */}
          <div className="double-bezel-outer rounded-[1.75rem] p-1 sm:col-span-2 lg:col-span-1">
            <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <Users className="w-5 h-5" strokeWidth={1.5} />
              </div>
              <div className="flex-1">
                <span className="block text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">Lanes Tracked</span>
                <span className="block text-xl font-bold tracking-tight text-white font-mono mt-0.5">
                  {activeMembersToday} Active Lanes
                </span>
                <p className="text-[10px] text-zinc-500 mt-1 font-mono">
                  Archived state snapshot for user directory
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Mobile Tab Selectors (only visible on mobile screens < md) */}
        <div className="md:hidden flex overflow-x-auto gap-2 pb-3 mb-5 scrollbar-none">
          {users.map((user) => {
            const isActive = activeMobileUserId === user.id;
            const theme = COLOR_THEMES[user.color] || COLOR_THEMES.indigo;
            const UserAvIcon = AVATAR_MAP[user.avatar] || Terminal;
            return (
              <button
                key={user.id}
                onClick={() => setActiveMobileUserId(user.id)}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-xs font-semibold whitespace-nowrap border transition-all cursor-pointer ${
                  isActive 
                    ? `bg-zinc-900 border-white/20 text-white` 
                    : 'bg-zinc-950/40 border-white/5 text-zinc-500'
                }`}
              >
                <UserAvIcon className={`w-3.5 h-3.5 ${isActive ? theme.text : 'text-zinc-500'}`} strokeWidth={1.5} />
                <span>{user.name}</span>
              </button>
            );
          })}
        </div>

        {/* Lanes Grid Layout */}
        {loading ? (
          <div className="flex flex-col flex-1 items-center justify-center py-32">
            <Loader2 className="w-8 h-8 text-zinc-500 animate-spin" strokeWidth={1.5} />
            <p className="mt-4 text-zinc-400 font-medium text-xs tracking-wider uppercase font-mono">RETRIEVING SNAPSHOT...</p>
          </div>
        ) : users.length === 0 ? (
          <div className="flex flex-col flex-1 items-center justify-center py-20 border border-dashed border-white/5 rounded-[2.5rem] bg-white/[0.01] max-w-md mx-auto w-full mt-10 p-6">
            <AlertTriangle className="w-10 h-10 text-zinc-600 mb-4" strokeWidth={1.5} />
            <h3 className="text-sm font-semibold text-zinc-300">No board snapshot</h3>
            <p className="text-xs text-zinc-500 text-center px-4 mt-2 leading-relaxed">
              There is no recorded checkup activity on this date.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
            
            {/* Render Bento Lanes (Filtered for mobile view) */}
            {users.map((user) => {
              const theme = COLOR_THEMES[user.color] || COLOR_THEMES.indigo;
              const userTasks = tasks.filter(t => t.userId === user.id);
              
              // Status counts
              const doneCount = userTasks.filter(t => t.status === 'done').length;
              const totalCount = userTasks.length;
              
              // Mobile visibility toggle
              const mobileHiddenClass = activeMobileUserId === user.id ? 'block' : 'hidden md:block';
              const UserLaneAvatar = AVATAR_MAP[user.avatar] || Terminal;

              return (
                <div 
                  key={user.id} 
                  className={`double-bezel-outer rounded-[2.5rem] p-1.5 ${mobileHiddenClass} relative transition-all duration-500`}
                >
                  <div className="double-bezel-inner rounded-[calc(2.5rem-0.375rem)] overflow-hidden relative">
                    {/* Glowing background accent */}
                    <div className={`absolute top-0 inset-x-0 h-24 bg-gradient-to-b ${theme.glow} pointer-events-none`} />

                    {/* Column Header */}
                    <div className="px-5 py-4 border-b border-white/5 flex items-center justify-between bg-zinc-950/30 relative z-10">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-zinc-950/80 border border-white/5 flex items-center justify-center text-zinc-200">
                          <UserLaneAvatar className="w-4 h-4 text-zinc-200" strokeWidth={1.5} />
                        </div>
                        <div>
                          <h3 className="font-semibold text-xs text-zinc-200 flex items-center gap-1.5 font-sans">
                            {user.name}
                          </h3>
                          <p className="text-[9px] text-zinc-500 font-semibold uppercase tracking-wider font-mono mt-0.5">
                            Snapshot Lane
                          </p>
                        </div>
                      </div>

                      {/* Progress Badge */}
                      <div className={`text-[10px] font-bold font-mono px-2.5 py-1 rounded-full border ${theme.badge}`}>
                        {doneCount}/{totalCount}
                      </div>
                    </div>

                    {/* Column Content */}
                    <div className="p-4 flex flex-col gap-4 relative z-10 min-h-[250px]">
                      
                      {/* Task list inside this column */}
                      <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                        {userTasks.length === 0 ? (
                          <div className="flex flex-col items-center justify-center py-16 text-center border border-dashed border-white/5 rounded-2xl bg-white/[0.01]">
                            <ListTodo className="w-7 h-7 text-zinc-600 mb-2.5" strokeWidth={1.5} />
                            <p className="text-[10px] text-zinc-500 font-semibold tracking-wide uppercase font-mono">No tasks logged</p>
                          </div>
                        ) : (
                          userTasks.map((task) => (
                            <TaskCard
                              key={task.id}
                              task={task}
                              currentUserId={null}
                              isReadOnly={true}
                              onUpdate={noopUpdate}
                              onDelete={noopDelete}
                            />
                          ))
                        )}
                      </div>

                    </div>
                  </div>
                </div>
              );
            })}

          </div>
        )}

      </main>
    </div>
  );
}
