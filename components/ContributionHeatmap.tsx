'use client';

import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Color-level thresholds (easy to adjust)
// Level 0 = 0 tasks, Level 1 = 1–2, Level 2 = 3–4, Level 3 = 5–6, Level 4 = 7+
// Change the four numbers below to re-calibrate all intensity steps at once.
// ---------------------------------------------------------------------------
const THRESHOLDS = [1, 3, 5, 7] as const; // [L1_min, L2_min, L3_min, L4_min]

/** Map a completed-task count to a 0–4 intensity level */
function getLevel(count: number): 0 | 1 | 2 | 3 | 4 {
  if (count <= 0) return 0;
  if (count < THRESHOLDS[1]) return 1; // 1–2  → faint accent
  if (count < THRESHOLDS[2]) return 2; // 3–4  → medium accent
  if (count < THRESHOLDS[3]) return 3; // 5–6  → strong accent
  return 4;                             // 7+   → full accent
}

// ---------------------------------------------------------------------------
// Per-theme accent color palettes (5 entries, one per level 0–4)
// Inline styles are used to avoid Tailwind's build-time class purging.
// ---------------------------------------------------------------------------
const ACCENT_COLORS: Record<string, string[]> = {
  // [level-0 neutral, level-1, level-2, level-3, level-4]
  indigo:  ['#27272a', '#312e81', '#3730a3', '#4338ca', '#6366f1'],
  rose:    ['#27272a', '#881337', '#9f1239', '#be123c', '#f43f5e'],
  emerald: ['#27272a', '#064e3b', '#065f46', '#047857', '#10b981'],
  amber:   ['#27272a', '#78350f', '#92400e', '#b45309', '#f59e0b'],
  purple:  ['#27272a', '#4a1d96', '#5b21b6', '#6d28d9', '#a855f7'],
  cyan:    ['#27272a', '#164e63', '#155e75', '#0e7490', '#06b6d4'],
};

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Monday-start week (Mon=row 0 … Sun=row 6), matching GitHub's convention.
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
// Only Mon (0), Wed (2), Fri (4) display text labels — alternating rows like GitHub.
const VISIBLE_DAY_INDICES = new Set([0, 2, 4]);

// ---------------------------------------------------------------------------
// Helper: convert a JS Date weekday (0=Sun … 6=Sat) to Monday-based index
// Mon=0, Tue=1, Wed=2, Thu=3, Fri=4, Sat=5, Sun=6
// ---------------------------------------------------------------------------
function toMondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

// ---------------------------------------------------------------------------
// Helper: format a local Date to YYYY-MM-DD without UTC shift
// ---------------------------------------------------------------------------
function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface ContributionHeatmapProps {
  /** Sparse map of YYYY-MM-DD → number of tasks completed that day */
  counts: Record<string, number>;
  /** Calendar year to display (Jan 1 – Dec 31). Defaults to the current year. */
  year?: number;
  /** User's theme color — matches existing COLOR_THEMES keys */
  userColor?: string;
}

/** A single day square */
interface DayCell {
  /** YYYY-MM-DD for real days; empty string for out-of-year filler cells */
  dateStr: string;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

/** One week column (always 7 cells, Mon–Sun) plus an optional month label */
interface WeekColumn {
  cells: DayCell[];
  /** Month name to display above this column (set when column contains the 1st of a month) */
  monthLabel?: string;
}

export function ContributionHeatmap({
  counts,
  year = new Date().getFullYear(),
  userColor = 'indigo',
}: ContributionHeatmapProps) {
  const [tooltip, setTooltip] = useState<{ dateStr: string; count: number; x: number; y: number } | null>(null);

  const accentPalette = ACCENT_COLORS[userColor] || ACCENT_COLORS.indigo;

  // ---------------------------------------------------------------------------
  // Build the week grid for the fixed calendar year.
  //
  // Grid layout (Monday-start, same as GitHub):
  //   - Column 0: the Monday on or before Jan 1 of `year`
  //     → May include a few trailing days from Dec of the previous year (filler)
  //   - Last column: the Sunday on or after Dec 31 of `year`
  //     → May include a few leading days from Jan of the next year (filler)
  //   - Every column has exactly 7 cells (rows 0–6 = Mon–Sun)
  //   - Out-of-year cells render as transparent/empty squares
  //
  // Month labels are attached to whichever column contains the 1st of that month.
  // ---------------------------------------------------------------------------
  const { weeks, totalCompleted, streak } = useMemo(() => {
    // Fixed year boundaries (local time, midnight)
    const jan1  = new Date(year, 0,  1);  // January  1 of `year`
    const dec31 = new Date(year, 11, 31); // December 31 of `year`
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // The grid starts on the Monday of the week containing Jan 1.
    // Monday-based index of Jan 1 (Mon=0 … Sun=6):
    const jan1MondayIdx = toMondayIndex(jan1.getDay());
    const gridStart = new Date(jan1);
    gridStart.setDate(jan1.getDate() - jan1MondayIdx); // roll back to Monday

    // The grid ends on the Sunday of the week containing Dec 31.
    const dec31MondayIdx = toMondayIndex(dec31.getDay());
    const gridEnd = new Date(dec31);
    gridEnd.setDate(dec31.getDate() + (6 - dec31MondayIdx)); // advance to Sunday

    // Iterate day by day, week by week, building column arrays
    const weekColumns: WeekColumn[] = [];
    const cursor = new Date(gridStart); // mutable cursor; always a Monday at loop start

    while (cursor <= gridEnd) {
      const cells: DayCell[] = [];
      let weekMonthLabel: string | undefined;

      for (let d = 0; d < 7; d++) {
        const isInYear = cursor >= jan1 && cursor <= dec31;

        if (!isInYear) {
          // Out-of-year padding cell (transparent, no square color)
          cells.push({ dateStr: '', count: 0, level: 0 });
        } else {
          const dateStr = toDateStr(cursor);
          const count   = counts[dateStr] ?? 0;
          cells.push({ dateStr, count, level: getLevel(count) });

          // If this is the 1st of a month, attach the month label to this column.
          // Doing this inside the d-loop (not just at d===0) ensures the label
          // lands on the correct column even when the 1st falls mid-week.
          if (cursor.getDate() === 1) {
            weekMonthLabel = MONTH_LABELS[cursor.getMonth()];
          }
        }

        cursor.setDate(cursor.getDate() + 1); // advance to next day
      }

      weekColumns.push({ cells, monthLabel: weekMonthLabel });
    }

    // ── Summary stats ──────────────────────────────────────────────────────
    // Total: sum of all completed tasks within the `counts` data
    const totalCompleted = Object.values(counts).reduce((s, n) => s + n, 0);

    // Current streak: consecutive days going backwards from today with ≥1 completion
    let streak = 0;
    const sc = new Date(today);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const ds = toDateStr(sc);
      if ((counts[ds] ?? 0) > 0) {
        streak++;
        sc.setDate(sc.getDate() - 1);
      } else {
        break;
      }
    }

    return { weeks: weekColumns, totalCompleted, streak };
  }, [counts, year]);

  // Format YYYY-MM-DD → human-readable string for tooltip / aria-label
  const formatDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [y, m, d] = dateStr.split('-');
    // Use local Date constructor (no UTC shift) for accurate day display
    const date = new Date(Number(y), Number(m) - 1, Number(d));
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, filter: 'blur(6px)' }}
      animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
      transition={{ type: 'spring', stiffness: 80, damping: 20, delay: 0.05 }}
      className="double-bezel-outer rounded-[1.75rem] p-1 mb-8"
    >
      <div className="double-bezel-inner rounded-[calc(1.75rem-0.25rem)] p-5 sm:p-6 overflow-hidden">

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5">
          <div>
            <span className="block text-[9px] font-semibold text-zinc-500 uppercase tracking-widest font-mono mb-1">
              Productivity Heatmap
            </span>
            <h2 className="text-sm font-semibold text-zinc-100 font-sans flex items-center gap-2">
              Completion Activity
              {/* Year label — visible like GitHub's year heading */}
              <span className="text-[11px] font-bold font-mono px-2 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.07] text-zinc-400">
                {year}
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

        {/* ── Grid (horizontally scrollable on small screens) ─────────────── */}
        <div className="overflow-x-auto pb-1">
          {/*
            minWidth ensures the grid doesn't collapse.
            13px per column = 11px cell + 2px gap. 32px reserved for day labels on the left.
          */}
          <div className="relative" style={{ minWidth: `${weeks.length * 13 + 32}px` }}>

            {/* Month labels row — one div per week column */}
            <div className="flex mb-1.5" style={{ paddingLeft: '32px' }}>
              {weeks.map((week, wi) => (
                <div
                  key={wi}
                  className="text-[9px] text-zinc-500 font-mono leading-none"
                  style={{ width: '11px', marginRight: '2px', flexShrink: 0 }}
                >
                  {/* Label appears on the column that contains the 1st of a month */}
                  {week.monthLabel ?? ''}
                </div>
              ))}
            </div>

            {/* Grid body: day-of-week labels on the left + week columns */}
            <div className="flex gap-0">

              {/* Day-of-week labels (Mon → Sun, only Mon/Wed/Fri show text) */}
              <div
                className="flex flex-col gap-[2px] flex-shrink-0"
                style={{ width: '28px', marginRight: '4px' }}
              >
                {DAY_LABELS.map((label, di) => (
                  <div
                    key={di}
                    className="text-[9px] font-mono text-zinc-600 leading-none flex items-center"
                    style={{ height: '11px' }}
                    aria-hidden="true"
                  >
                    {VISIBLE_DAY_INDICES.has(di) ? label : ''}
                  </div>
                ))}
              </div>

              {/* Week columns (each has exactly 7 cells: Mon row 0 … Sun row 6) */}
              <div className="flex gap-[2px]">
                {weeks.map((week, wi) => (
                  <div key={wi} className="flex flex-col gap-[2px]">
                    {week.cells.map((cell, di) => {
                      // Out-of-year filler: transparent placeholder square
                      if (!cell.dateStr) {
                        return (
                          <div
                            key={di}
                            style={{ width: '11px', height: '11px', borderRadius: '2px' }}
                            aria-hidden="true"
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
                          tabIndex={0}
                          onMouseEnter={(e) => {
                            const rect = (e.target as HTMLElement).getBoundingClientRect();
                            setTooltip({
                              dateStr: cell.dateStr,
                              count:   cell.count,
                              x:       rect.left + rect.width / 2,
                              y:       rect.top,
                            });
                          }}
                          onMouseLeave={() => setTooltip(null)}
                          onFocus={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1.35)';
                            const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                            setTooltip({ dateStr: cell.dateStr, count: cell.count, x: rect.left + rect.width / 2, y: rect.top });
                          }}
                          onBlur={(e) => {
                            (e.currentTarget as HTMLElement).style.transform = 'scale(1)';
                            setTooltip(null);
                          }}
                          style={{
                            width:           '11px',
                            height:          '11px',
                            borderRadius:    '2px',
                            backgroundColor: bg,
                            // Active cells get a subtle inner highlight + color ring
                            boxShadow: cell.level > 0
                              ? `0 0 0 1px ${bg}60, inset 0 1px 0 rgba(255,255,255,0.12)`
                              : 'inset 0 1px 0 rgba(255,255,255,0.04)',
                            cursor:     'default',
                            transition: 'transform 0.1s ease',
                          }}
                          onMouseOver={(e) => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.35)'; }}
                          onMouseOut={(e)  => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ── Legend ─────────────────────────────────────────────────────── */}
        <div className="flex items-center gap-2 mt-4 justify-end" aria-label="Color scale legend">
          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">Less</span>
          {([0, 1, 2, 3, 4] as const).map((level) => (
            <div
              key={level}
              aria-hidden="true"
              style={{
                width:           '11px',
                height:          '11px',
                borderRadius:    '2px',
                backgroundColor: accentPalette[level],
                boxShadow: level > 0 ? `0 0 0 1px ${accentPalette[level]}60` : undefined,
              }}
            />
          ))}
          <span className="text-[9px] text-zinc-600 font-mono uppercase tracking-wider">More</span>
        </div>

      </div>

      {/* ── Floating tooltip (fixed-position to escape overflow:hidden) ──── */}
      {tooltip && (
        <div
          role="tooltip"
          className="fixed z-50 pointer-events-none"
          style={{
            left:      tooltip.x,
            top:       tooltip.y - 8,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <div className="glass-panel rounded-lg px-2.5 py-1.5 text-[10px] font-mono whitespace-nowrap border border-white/10 shadow-xl">
            <span className="text-zinc-300 font-semibold">{formatDate(tooltip.dateStr)}</span>
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
