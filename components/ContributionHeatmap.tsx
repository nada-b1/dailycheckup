'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Color-level thresholds (easy to adjust)
// Level 0 = 0 tasks, Level 1 = 1–2, Level 2 = 3–4, Level 3 = 5–6, Level 4 = 7+
// Change these numbers to re-calibrate intensity steps.
// ---------------------------------------------------------------------------
const THRESHOLDS = [1, 3, 5, 7] as const; // [L1_min, L2_min, L3_min, L4_min]

/** Map a completed-task count to a 0–4 intensity level */
function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count < THRESHOLDS[1]) return 1; // 1–2
  if (count < THRESHOLDS[2]) return 2; // 3–4
  if (count < THRESHOLDS[3]) return 3; // 5–6
  return 4;                             // 7+
}

// ---------------------------------------------------------------------------
// Per-theme accent colors (match the app's COLOR_THEMES palette)
// Each level entry is a Tailwind-compatible inline style object
// (We use inline styles rather than dynamic class names to avoid purge issues)
// ---------------------------------------------------------------------------
const ACCENT_COLORS: Record<string, string[]> = {
  // [level-0 bg, level-1, level-2, level-3, level-4]
  indigo:  ['#27272a', '#312e81', '#3730a3', '#4338ca', '#6366f1'],
  rose:    ['#27272a', '#881337', '#9f1239', '#be123c', '#f43f5e'],
  emerald: ['#27272a', '#064e3b', '#065f46', '#047857', '#10b981'],
  amber:   ['#27272a', '#78350f', '#92400e', '#b45309', '#f59e0b'],
  purple:  ['#27272a', '#4a1d96', '#5b21b6', '#6d28d9', '#a855f7'],
  cyan:    ['#27272a', '#164e63', '#155e75', '#0e7490', '#06b6d4'],
};

const MONTH_LABELS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
// Only render labels for Mon, Wed, Fri to keep it compact (like GitHub)
const VISIBLE_DAY_INDICES = new Set([1, 3, 5]);

interface ContributionHeatmapProps {
  /** User ID whose completed tasks heatmap is rendered */
  userId: string;
  /** Optional pre-fetched map of YYYY-MM-DD → number of tasks completed that day */
  counts?: Record<string, number>;
  /** How many months the data covers (default: 12) */
  months?: number;
  /** User's theme color — matches existing COLOR_THEMES keys */
  userColor?: string;
  /** Optional user name for header display */
  userName?: string;
  /** Optional callback fired when stats (totalCompleted, streak) are calculated or updated */
  onStatsChange?: (stats: { totalCompleted: number; streak: number; counts: Record<string, number> }) => void;
  /** Optional extra classes */
  className?: string;
}

interface DayCell {
  dateStr: string;   // YYYY-MM-DD
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
  monthLabel?: string; // set on first day of a new month visible in this column
}

export function ContributionHeatmap({
  userId,
  counts: externalCounts,
  months = 12,
  userColor = 'indigo',
  userName,
  onStatsChange,
  className = '',
}: ContributionHeatmapProps) {
  const [internalCounts, setInternalCounts] = useState<Record<string, number>>(externalCounts || {});
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<{ dateStr: string; count: number; x: number; y: number } | null>(null);

  // Fetch heatmap data for the specific user whenever userId or months change,
  // unless externalCounts was explicitly provided
  useEffect(() => {
    if (externalCounts !== undefined) {
      setInternalCounts(externalCounts);
      return;
    }

    if (!userId) return;

    let cancelled = false;
    setLoading(true);

    fetch(`/api/heatmap?userId=${encodeURIComponent(userId)}&months=${months}`)
      .then(async (res) => {
        if (!res.ok) {
          throw new Error(`Failed to fetch heatmap data (${res.status})`);
        }
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setInternalCounts(data.counts || {});
          setLoading(false);
        }
      })
      .catch((err) => {
        console.error(`Heatmap fetch error for user ${userId}:`, err);
        if (!cancelled) {
          setInternalCounts({});
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, months, externalCounts]);

  const activeCounts = externalCounts !== undefined ? externalCounts : internalCounts;

  const accentPalette = ACCENT_COLORS[userColor] || ACCENT_COLORS.indigo;

  // ---------------------------------------------------------------------------
  // Build the week columns for the last `months` worth of data.
  // The grid always starts on a Sunday and ends on today (inclusive).
  // ---------------------------------------------------------------------------
  const { weeks, totalCompleted, streak } = useMemo(() => {
    // Compute today in local time (no timezone offset needed here — server
    // already constrained the date range, we just need a stable "today" for UI)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // End = today; Start = today minus ~months months, rolled back to the prior Sunday
    const startDate = new Date(today);
    startDate.setMonth(startDate.getMonth() - months);
    // Roll back to Sunday
    startDate.setDate(startDate.getDate() - startDate.getDay());

    // Build an array of week columns [ [day0, day1, ..., day6], ... ]
    const weekColumns: DayCell[][] = [];
    const cursor = new Date(startDate);
    let lastMonth = -1;

    while (cursor <= today) {
      const week: DayCell[] = [];
      for (let d = 0; d < 7; d++) {
        if (cursor > today) {
          // Future days — empty filler cell
          week.push({ dateStr: '', count: 0, level: 0 });
        } else {
          const y = cursor.getFullYear();
          const m = String(cursor.getMonth() + 1).padStart(2, '0');
          const day = String(cursor.getDate()).padStart(2, '0');
          const dateStr = `${y}-${m}-${day}`;
          const count = activeCounts[dateStr] ?? 0;

          // Attach month label to the first cell in the column when month changes
          let monthLabel: string | undefined;
          if (d === 0 && cursor.getMonth() !== lastMonth) {
            monthLabel = MONTH_LABELS[cursor.getMonth()];
            lastMonth = cursor.getMonth();
          }

          week.push({ dateStr, count, level: getLevel(count), monthLabel });
        }
        cursor.setDate(cursor.getDate() + 1);
      }
      weekColumns.push(week);
    }

    // Compute summary stats
    const totalCompleted = Object.values(activeCounts).reduce((s, n) => s + n, 0);

    // Current streak: consecutive days (going backwards from today or yesterday) with ≥1 task done
    let streak = 0;
    const streakCursor = new Date(today);
    const todayDs = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    
    // If no tasks completed today yet, start counting from yesterday so active streak is preserved
    if ((activeCounts[todayDs] ?? 0) === 0) {
      streakCursor.setDate(streakCursor.getDate() - 1);
    }

    while (true) {
      const y = streakCursor.getFullYear();
      const m = String(streakCursor.getMonth() + 1).padStart(2, '0');
      const d = String(streakCursor.getDate()).padStart(2, '0');
      const ds = `${y}-${m}-${d}`;
      if ((activeCounts[ds] ?? 0) > 0) {
        streak++;
        streakCursor.setDate(streakCursor.getDate() - 1);
      } else {
        break;
      }
    }

    return { weeks: weekColumns, totalCompleted, streak };
  }, [activeCounts, months]);

  // Notify parent of updated stats
  const onStatsChangeRef = React.useRef(onStatsChange);
  onStatsChangeRef.current = onStatsChange;

  useEffect(() => {
    onStatsChangeRef.current?.({ totalCompleted, streak, counts: activeCounts });
  }, [totalCompleted, streak, activeCounts]);

  // Format a date string for tooltip / aria-label
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <motion.div
      key={`${userId}-${userColor}`}
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.05 }}
      className={`double-bezel-outer rounded-[1.75rem] p-1 mb-8 ${className}`}
    >
      <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 sm:p-6 overflow-hidden">

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono">
                Productivity Heatmap
              </span>
              {loading && (
                <span className="text-[9px] text-zinc-500 font-mono animate-pulse">
                  Updating...
                </span>
              )}
            </div>
            <h2 className="text-sm font-semibold text-zinc-100 font-sans flex items-center gap-2 flex-wrap">
              Completion Activity
              {userName && (
                <span className="text-[11px] font-medium text-zinc-300 font-mono px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/10">
                  {userName}
                </span>
              )}
              <span className="text-[10px] font-normal text-zinc-500 font-mono">
                last {months} months
              </span>
            </h2>
          </div>

          {/* Summary pills */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[10px] font-mono text-zinc-300">
              <span className="text-zinc-500">Total</span>
              <span className="font-bold text-white">{totalCompleted}</span>
              <span className="text-zinc-500">done</span>
            </span>
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/5 text-[10px] font-mono text-zinc-300">
              <span className="text-zinc-500">Streak</span>
              <span className="font-bold text-white">{streak}</span>
              <span className="text-zinc-500">day{streak !== 1 ? 's' : ''}</span>
            </span>
          </div>
        </div>

        {/* Grid wrapper — scrollable horizontally on small screens */}
        <div className="overflow-x-auto pb-1">
          <div className="relative" style={{ minWidth: `${weeks.length * 13 + 32}px` }}>

            {/* Month labels row */}
            <div
              className="flex mb-1.5"
              style={{ paddingLeft: '32px' }}
            >
              {weeks.map((week, wi) => {
                // Find any cell in this week that carries a month label
                const label = week.find(c => c.monthLabel)?.monthLabel;
                return (
                  <div
                    key={wi}
                    className="text-[9px] text-zinc-500 font-mono leading-none"
                    style={{ width: '11px', marginRight: '2px', flexShrink: 0 }}
                  >
                    {label || ''}
                  </div>
                );
              })}
            </div>

            {/* Main grid: day-of-week rows × week columns */}
            <div className="flex gap-0">
              {/* Day-of-week labels (left side) */}
              <div
                className="flex flex-col gap-[2px] flex-shrink-0"
                style={{ width: '28px', marginRight: '4px', paddingTop: '0px' }}
              >
                {DAY_LABELS.map((label, di) => (
                  <div
                    key={di}
                    className="text-[9px] font-mono text-zinc-600 leading-none flex items-center"
                    style={{ height: '11px' }}
                  >
                    {VISIBLE_DAY_INDICES.has(di) ? label : ''}
                  </div>
                ))}
              </div>

              {/* Week columns */}
              <div className="relative flex gap-[2px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.map((cell, di) => {
                      // Empty filler for future days
                      if (!cell.dateStr) {
                        return (
                          <div
                            key={di}
                            style={{ width: '11px', height: '11px', borderRadius: '2px' }}
                          />
                        );
                      }

                      const bg = accentPalette[cell.level];
                      const ariaLabel =
                        cell.count === 0
                          ? `${formatDate(cell.dateStr)}: no tasks completed`
                          : `${formatDate(cell.dateStr)}: ${cell.count} task${cell.count !== 1 ? 's' : ''} completed`;

                      return (
                        <div
                          key={di}
                          role="img"
                          aria-label={ariaLabel}
                          title={ariaLabel}
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({ dateStr: cell.dateStr, count: cell.count, x: rect.left + rect.width / 2, y: rect.top });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          style={{
                            width: '11px',
                            height: '11px',
                            borderRadius: '2px',
                            backgroundColor: bg,
                            // Subtle ring on cells with activity
                            boxShadow: cell.level > 0
                              ? `0 0 0 1px ${bg}60, inset 0 1px 0 rgba(255,255,255,0.12)`
                              : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                            cursor: 'default',
                            transition: 'transform 0.1s ease, box-shadow 0.1s ease',
                          }}
                          onMouseOver={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1.35)';
                          }}
                          onFocus={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1.35)';
                          }}
                          onMouseOut={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                          }}
                          onBlur={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                          }}
                          tabIndex={0}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Legend row */}
        <div className="flex items-center gap-2 mt-4 justify-end">
          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">Less</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <div
              key={level}
              style={{
                width: '11px',
                height: '11px',
                borderRadius: '2px',
                backgroundColor: accentPalette[level],
                boxShadow: level > 0 ? `0 0 0 1px ${accentPalette[level]}60` : undefined,
              }}
              aria-hidden="true"
            />
          ))}
          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">More</span>
        </div>

      </div>

      {/* Floating tooltip — rendered as a fixed overlay */}
      {tooltip && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="glass-panel rounded-lg px-2.5 py-1.5 text-[10px] font-mono whitespace-nowrap border border-white/10 shadow-xl">
            <span className="text-zinc-300 font-semibold">
              {formatDate(tooltip.dateStr)}
            </span>
            <span className="text-zinc-500 mx-1">·</span>
            <span className="text-white font-bold">{tooltip.count}</span>
            <span className="text-zinc-500 ml-1">
              task{tooltip.count !== 1 ? 's' : ''} completed
            </span>
          </div>
        </div>
      )}
    </motion.div>
  );
}
