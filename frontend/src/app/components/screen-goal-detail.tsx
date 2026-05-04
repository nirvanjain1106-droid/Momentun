import { useEffect, useState } from 'react';
import { ChevronLeft, Edit2, CheckCircle2, Circle } from 'lucide-react';
import { PrimaryButton } from './atom-button-primary';
import { TaskCard, CATEGORY_COLORS } from './molecule-card-task';
import { getGoalById } from '../../api/scheduleApi';
import type { GoalDetail } from '../../api/scheduleApi';

export interface GoalDetailScreenProps {
  navigate: (screen: string) => void;
  goalId: string;
}

export function GoalDetailScreen({ navigate, goalId }: GoalDetailScreenProps) {
  const [goal, setGoal] = useState<GoalDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchGoal = async () => {
      try {
        setLoading(true);
        const data = await getGoalById(goalId);
        setGoal(data);
      } catch (error) {
        console.error("Failed to fetch goal:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchGoal();
  }, [goalId]);

  if (loading || !goal) {
    return (
      <div className="flex-1 w-full h-full min-h-screen bg-[#FAF6F2] flex items-center justify-center">
        <div className="w-8 h-8 rounded-full border-4 border-t-accent-primary border-r-transparent border-b-transparent border-l-transparent animate-spin" />
      </div>
    );
  }

  // Helper for status badge
  const getStatusBadge = (status: GoalDetail['status']) => {
    let bg = 'var(--surface-border)'; // #EDE5DE
    let color = 'var(--text-secondary)'; // #6B5C54
    if (status === 'On Track') {
      bg = '#E8F5E9'; // light green
      color = 'var(--status-success, #1A7A4A)';
    } else if (status === 'Slightly Behind') {
      bg = '#FFF3E0'; // light orange
      color = 'var(--status-warning, #C47F1A)';
    } else if (status === 'Behind') {
      bg = '#FFEBEE'; // light red
      color = 'var(--status-error, #C0392B)';
    }

    return (
      <span style={{
        backgroundColor: bg,
        color: color,
        padding: '4px 10px',
        borderRadius: 'var(--radius-pill, 9999px)',
        fontSize: '13px',
        fontWeight: 'var(--font-weight-semibold)',
        marginTop: '12px',
        display: 'inline-block'
      }}>
        {status}
      </span>
    );
  };

  // SVG Ring Chart
  const ringSize = 120;
  const strokeWidth = 10;
  const radius = (ringSize - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (goal.progress / 100) * circumference;

  // SVG Line Chart
  const chartHeight = 160;
  const chartWidth = 343; // estimated width for padding
  const paddingX = 20;
  const paddingY = 20;
  const plotWidth = chartWidth - paddingX * 2;
  const plotHeight = chartHeight - paddingY * 2;
  
  const maxY = 100;
  const points = goal.trajectory.map((val, i) => {
    const x = paddingX + (i / (goal.trajectory.length - 1)) * plotWidth;
    const y = chartHeight - paddingY - (val / maxY) * plotHeight;
    return `${x},${y}`;
  }).join(' ');

  const currentPoint = points.split(' ').pop()?.split(',') || ['0','0'];

  return (
    <div className="flex flex-col w-full min-h-screen bg-[#FAF6F2] font-sf-pro text-[#1A1210]">
      {/* HEADER */}
      <header className="flex items-center justify-between px-4 py-4 shrink-0 bg-[#FAF6F2] sticky top-0 z-10">
        <button 
          onClick={() => navigate('goals')} 
          className="p-2 -ml-2 text-[#1A1210] active:opacity-70 transition-opacity"
          aria-label="Back to goals"
        >
          <ChevronLeft size={24} />
        </button>
        <h1 className="text-[17px] font-semibold tracking-tight">Goal Detail</h1>
        <button 
          className="p-2 -mr-2 text-[#1A1210] active:opacity-70 transition-opacity"
          aria-label="Edit goal"
        >
          <Edit2 size={20} />
        </button>
      </header>

      <div className="flex-1 overflow-y-auto pb-32 px-4 space-y-4">
        {/* HERO SECTION */}
        <section className="bg-white rounded-[16px] border border-[#EDE5DE] p-6 shadow-[0_2px_8px_rgba(26,18,16,0.06)] flex flex-col items-center text-center">
          <div className="relative mb-6" style={{ width: ringSize, height: ringSize }}>
            {/* Background ring */}
            <svg width={ringSize} height={ringSize} className="transform -rotate-90">
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke="#F5E8E4"
                strokeWidth={strokeWidth}
                fill="none"
              />
              {/* Progress ring */}
              <circle
                cx={ringSize / 2}
                cy={ringSize / 2}
                r={radius}
                stroke={goal.color}
                strokeWidth={strokeWidth}
                fill="none"
                strokeLinecap="round"
                style={{
                  strokeDasharray: circumference,
                  strokeDashoffset: offset,
                  transition: 'stroke-dashoffset 1s ease-in-out'
                }}
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center flex-col">
              <span className="text-[28px] font-bold text-[#1A1210] leading-none">{goal.progress}%</span>
            </div>
          </div>
          <h2 className="text-[22px] font-semibold text-[#1A1210] mb-1">{goal.name}</h2>
          <p className="text-[15px] text-[#6B5C54]">{goal.subtitle}</p>
          {getStatusBadge(goal.status)}
        </section>

        {/* TRAJECTORY CARD */}
        <section className="bg-white rounded-[16px] border border-[#EDE5DE] p-4 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
          <h3 className="text-[15px] font-semibold text-[#1A1210] mb-4">Progress over time</h3>
          <div className="w-full relative" style={{ height: chartHeight }}>
            <svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`} preserveAspectRatio="none">
              {/* Grid lines */}
              <line x1={paddingX} y1={paddingY} x2={chartWidth-paddingX} y2={paddingY} stroke="#EDE5DE" strokeWidth="1" strokeDasharray="4 4" />
              <line x1={paddingX} y1={chartHeight/2} x2={chartWidth-paddingX} y2={chartHeight/2} stroke="#EDE5DE" strokeWidth="1" strokeDasharray="4 4" />
              <line x1={paddingX} y1={chartHeight-paddingY} x2={chartWidth-paddingX} y2={chartHeight-paddingY} stroke="#EDE5DE" strokeWidth="1" strokeDasharray="4 4" />
              
              {/* Line */}
              <polyline
                points={points}
                fill="none"
                stroke={goal.color}
                strokeWidth="3"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              
              {/* Current Progress Dot */}
              <circle
                cx={currentPoint[0]}
                cy={currentPoint[1]}
                r="5"
                fill={goal.color}
                stroke="#FFFFFF"
                strokeWidth="2"
              />
            </svg>
            <div className="absolute bottom-0 w-full flex justify-between px-[20px] text-[12px] text-[#9C8880]">
              <span>Jun</span>
              <span>Jul</span>
              <span>Aug</span>
              <span>Sep</span>
              <span>Oct</span>
              <span>Nov</span>
            </div>
          </div>
        </section>

        {/* MILESTONES CARD */}
        <section className="bg-white rounded-[16px] border border-[#EDE5DE] p-4 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
          <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">Milestones</h3>
          <div className="space-y-3">
            {goal.milestones.map((milestone) => (
              <div key={milestone.id} className="flex items-start gap-3">
                <button className="mt-0.5 focus:outline-none">
                  {milestone.completed ? (
                    <CheckCircle2 size={20} className="text-[#B8472A]" fill="#F5E8E4" />
                  ) : (
                    <Circle size={20} className="text-[#EDE5DE]" />
                  )}
                </button>
                <div className="flex-1">
                  <p className={`text-[15px] ${milestone.completed ? 'text-[#6B5C54] line-through' : 'text-[#1A1210]'}`}>
                    {milestone.name}
                  </p>
                  <p className="text-[13px] text-[#9C8880]">{milestone.dueDate}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* TASKS LINKED CARD */}
        <section className="bg-white rounded-[16px] border border-[#EDE5DE] p-4 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
          <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">Related Tasks</h3>
          <div className="space-y-3">
            {goal.linkedTasks.map((task) => (
              <TaskCard 
                key={task.id}
                state="Inactive"
                taskName={task.name}
                duration={task.duration}
                categoryColor={task.color || CATEGORY_COLORS.teal}
                subtitle="Goal related task"
                showAvatars={false}
                appIcons={[]}
              />
            ))}
          </div>
        </section>
      </div>

      {/* CTA */}
      <div className="fixed bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-[#FAF6F2] via-[#FAF6F2] to-transparent pb-safe">
        <div className="flex flex-col gap-3">
          <PrimaryButton label="Log Progress" />
          <button className="h-[52px] w-full rounded-[12px] font-semibold text-[15px] text-[#1A1210] bg-white border border-[#EDE5DE] active:bg-[#F5E8E4] transition-colors shadow-sm">
            Edit Goal
          </button>
        </div>
      </div>
    </div>
  );
}
