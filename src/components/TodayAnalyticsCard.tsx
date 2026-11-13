import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronDown, ChevronUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { TaskItem } from '../types/assistant';
import { computeDayTaskAnalytics } from '../utils/taskAnalytics';

interface TodayAnalyticsCardProps {
  tasks: TaskItem[];
  selectedDate: string;
}

export const TodayAnalyticsCard: React.FC<TodayAnalyticsCardProps> = ({
  tasks,
  selectedDate,
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const analytics = useMemo(
    () => computeDayTaskAnalytics(tasks, selectedDate),
    [tasks, selectedDate]
  );

  return (
    <section
      aria-label="今日任務數據分析儀表板"
      data-testid="today-analytics-dashboard"
      className="rounded-2xl border border-stone-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 space-y-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-stone-900 dark:text-zinc-100 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 accent-text" />
            <span>今日效率與類型分析</span>
          </h2>
          <p className="text-xs text-stone-600 dark:text-zinc-400 mt-0.5 tabular-nums">
            {selectedDate} · 總任務 {analytics.total} 項 · 完成率 {analytics.completionRate}% · 涵蓋 {analytics.categoryDistribution.length} 種類型
          </p>
        </div>

        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          aria-expanded={!collapsed}
          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 dark:border-zinc-700 px-3 py-1.5 text-xs font-medium text-stone-600 dark:text-zinc-300 hover:bg-stone-100 dark:hover:bg-zinc-800 min-h-[36px]"
        >
          <span>{collapsed ? '展開圖表' : '收合圖表'}</span>
          {collapsed ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronUp className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {!collapsed && (
        <>
          {analytics.total === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-200 dark:border-zinc-800 bg-stone-50/70 dark:bg-zinc-950/60 py-8 px-4 text-center text-xs text-stone-500 dark:text-zinc-400">
              {selectedDate} 尚無排程數據，新增待辦或會議後將即時繪製完成率與類型分佈圖表。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Left Chart: Task Completion Rate Donut */}
              <div className="rounded-xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/60 dark:bg-zinc-950/60 p-4 flex flex-col justify-between">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                    今日任務完成率
                  </h3>
                  <span className="text-xs font-mono text-stone-500 dark:text-zinc-400 tabular-nums">
                    {analytics.completed} / {analytics.total} 已完成
                  </span>
                </div>

                <div className="relative h-40 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <PieChart>
                      <Pie
                        data={analytics.completionSlices}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        innerRadius={44}
                        outerRadius={64}
                        paddingAngle={analytics.completed > 0 && analytics.pending > 0 ? 3 : 0}
                        stroke="none"
                        isAnimationActive={false}
                      >
                        {analytics.completionSlices.map((slice) => (
                          <Cell key={slice.name} fill={slice.color} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value, name) => [`${value} 項`, String(name)]}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          border: '1px solid #e7e5e4',
                          fontSize: '12px',
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-lg font-mono font-bold text-stone-900 dark:text-zinc-100 tabular-nums">
                      {analytics.completionRate}%
                    </span>
                    <span className="text-[11px] text-stone-500 dark:text-zinc-400">
                      達成率
                    </span>
                  </div>
                </div>

                <div className="mt-2 flex items-center justify-center gap-4 text-xs text-stone-600 dark:text-zinc-400 tabular-nums">
                  {analytics.completionSlices.map((slice) => (
                    <span key={slice.name} className="inline-flex items-center gap-1.5">
                      <span
                        className="w-2.5 h-2.5 rounded-xs shrink-0"
                        style={{ backgroundColor: slice.color }}
                        aria-hidden="true"
                      />
                      <span>
                        {slice.name} {slice.value} 項
                      </span>
                    </span>
                  ))}
                </div>
              </div>

              {/* Right Chart: Task Type Distribution BarChart */}
              <div className="rounded-xl border border-stone-200/80 dark:border-zinc-800 bg-stone-50/60 dark:bg-zinc-950/60 p-4 flex flex-col justify-between">
                <div className="flex items-baseline justify-between gap-2 mb-2">
                  <h3 className="text-xs font-semibold text-stone-800 dark:text-zinc-200">
                    任務類型分佈
                  </h3>
                  <span className="text-xs font-mono text-stone-500 dark:text-zinc-400 tabular-nums">
                    會議 {analytics.meetingTotal} · 一般 {analytics.total - analytics.meetingTotal}
                  </span>
                </div>

                <div className="h-40 w-full min-w-0">
                  <ResponsiveContainer width="100%" height="100%" minWidth={0}>
                    <BarChart
                      data={analytics.categoryDistribution}
                      margin={{ top: 8, right: 8, left: -24, bottom: 0 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        vertical={false}
                        stroke="rgba(120, 113, 108, 0.2)"
                      />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: '#78716c' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: '#78716c' }}
                        axisLine={false}
                        tickLine={false}
                      />
                      <Tooltip
                        cursor={{ fill: 'rgba(120, 113, 108, 0.08)' }}
                        formatter={(value, name) => [
                          `${value} 項`,
                          name === 'completed' ? '已完成' : '待完成',
                        ]}
                        contentStyle={{
                          borderRadius: '0.75rem',
                          border: '1px solid #e7e5e4',
                          fontSize: '12px',
                        }}
                      />
                      <Bar
                        dataKey="completed"
                        stackId="type"
                        fill="#0d9488"
                        radius={[0, 0, 4, 4]}
                        maxBarSize={32}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="pending"
                        stackId="type"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={32}
                        isAnimationActive={false}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="mt-2 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs text-stone-600 dark:text-zinc-400 tabular-nums">
                  {analytics.categoryDistribution.slice(0, 4).map((cat) => (
                    <span key={cat.name}>
                      {cat.name} {cat.total}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </section>
  );
};
