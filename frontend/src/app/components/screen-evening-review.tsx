import { useState, useEffect } from 'react';
import { ArrowLeft, X, Moon, ArrowRight, Clock, Trash2 } from 'lucide-react';
import * as scheduleApi from '../../api/scheduleApi';
import * as insightsApi from '../../api/insightsApi';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  navigate: (screen: string) => void;
}

export default function ScreenEveningReview({ navigate }: Props) {
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);

  // Step 1 Data
  const [todayStats, setTodayStats] = useState<any>(null);
  const [focusTime, setFocusTime] = useState<{hours: number, minutes: number} | null>(null);
  const [priorities, setPriorities] = useState<any[]>([]);
  const [completedTasks, setCompletedTasks] = useState<any[]>([]);

  // Step 2 Data
  const [biggestWin, setBiggestWin] = useState('');
  const [challenge, setChallenge] = useState('');
  const [challengeTags, setChallengeTags] = useState<string[]>([]);
  const [moodRating, setMoodRating] = useState<number | null>(null);
  const [gratitude, setGratitude] = useState('');

  // Step 3 Data
  const [unfinishedTasks, setUnfinishedTasks] = useState<any[]>([]);
  const [tomorrowPriorities, setTomorrowPriorities] = useState(['', '', '']);
  const [sleepReminder, setSleepReminder] = useState(false);

  // Load Initial Data
  useEffect(() => {
    const loadData = async () => {
      const today = new Date().toISOString().split('T')[0];
      try {
        const stats = await scheduleApi.getTodayStats();
        setTodayStats(stats);

        const focus = await insightsApi.getDailyFocusTime(today);
        setFocusTime(focus);

        const morning = await scheduleApi.getMorningCheckin(today);
        if (morning && morning.priorities) {
          setPriorities(morning.priorities);
        }

        const tasks = await scheduleApi.getTasks(today);
        if (tasks) {
          setCompletedTasks(tasks.filter((t: any) => t.completed));
        }

        const unfinished = await scheduleApi.getUnfinishedTasks(today);
        setUnfinishedTasks(unfinished || []);
      } catch (err) {
        console.error('Failed to load evening review data', err);
      }
    };
    loadData();
  }, []);

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await scheduleApi.saveEveningReview({
        day_rating: moodRating,
        biggest_win: biggestWin,
        challenge: challenge,
        challenge_tags: challengeTags,
        gratitude: gratitude,
        tomorrow_priorities: tomorrowPriorities.filter(p => p.trim() !== ''),
        date: today
      });
      setShowConfetti(true);
      setTimeout(() => {
        navigate('home');
      }, 1000);
    } catch (err) {
      console.error(err);
      setSubmitting(false);
    }
  };

  const togglePriorityStatus = async (id: string, currentStatus: boolean) => {
    const updated = priorities.map(p => p.id === id ? { ...p, completed: !currentStatus } : p);
    setPriorities(updated);
    await scheduleApi.updatePriorityStatus(id, !currentStatus);
  };

  const renderStep1 = () => {
    let completionRate = 0;
    if (todayStats && todayStats.tasksTotal > 0) {
      completionRate = todayStats.tasksDone / todayStats.tasksTotal;
    }

    let heroCard = null;
    if (completionRate > 0.7) {
      heroCard = (
        <div className="bg-gradient-to-b from-[#D4795C] to-[#B8472A] rounded-[16px] p-5 shadow-[0_4px_12px_rgba(184,71,42,0.2)] mb-6 text-white">
          <h2 className="text-[22px] font-bold mb-1">Great day, {useAuthStore.getState().userName || 'there'}! 🎉</h2>
          <p className="text-[15px] text-white/85">You completed {todayStats?.tasksDone || 0} of {todayStats?.tasksTotal || 0} tasks today</p>
        </div>
      );
    } else if (completionRate >= 0.4) {
      heroCard = (
        <div className="bg-[#F5E8E4] rounded-[16px] p-5 shadow-sm border-l-[3px] border-[#B8472A] mb-6">
          <h2 className="text-[20px] font-bold text-[#1A1210] mb-1">Solid progress today 💪</h2>
          <p className="text-[15px] text-[#6B5C54]">You completed {todayStats?.tasksDone || 0} of {todayStats?.tasksTotal || 0} tasks</p>
        </div>
      );
    } else {
      heroCard = (
        <div className="bg-[#FEF9EE] rounded-[16px] p-5 shadow-sm border-l-[3px] border-[#C47F1A] mb-6">
          <h2 className="text-[20px] font-bold text-[#1A1210] mb-1">Every day is a learning 🌱</h2>
          <p className="text-[15px] text-[#6B5C54]">You completed {todayStats?.tasksDone || 0} of {todayStats?.tasksTotal || 0} tasks. Tomorrow is a fresh start.</p>
        </div>
      );
    }

    const prioritiesCompleted = priorities.filter(p => p.completed).length;

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
        <div className="pt-[24px] pb-4">
          {heroCard}

          {/* Stats Row */}
          <div className="flex gap-3 mb-8">
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-sm text-center">
              <div className="text-[20px] font-bold text-[#1A1210]">{todayStats?.tasksDone || 0} <span className="text-[14px] text-[#9C8880] font-normal">/ {todayStats?.tasksTotal || 0}</span></div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-1">Tasks Done</div>
              <div className="text-[11px] text-[#1A7A4A] mt-1">{todayStats?.tasksDelta || ''} vs yday</div>
            </div>
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-sm text-center">
              <div className="text-[18px] font-bold text-[#1A1210] mt-[2px]">{focusTime?.hours || 0}h {focusTime?.minutes || 0}m</div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-[6px]">Focus Time</div>
            </div>
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-sm text-center">
              <div className="text-[20px] font-bold text-[#1A1210] mt-[2px]">{todayStats?.energyScore || 0}%</div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-[5px]">Energy</div>
            </div>
          </div>

          {/* Priorities Review */}
          <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">Your priorities from this morning</h3>
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] p-4 shadow-sm mb-2">
            <div className="flex flex-col gap-4">
              {priorities.map((p, i) => (
                <div key={p.id} className="flex items-center gap-3">
                  <button 
                    onClick={() => togglePriorityStatus(p.id, p.completed)}
                    className="flex-shrink-0 transition-transform active:scale-90"
                  >
                    {p.completed ? (
                      <div className="w-[24px] h-[24px] rounded-full bg-[#B8472A] flex items-center justify-center">
                        <Check size={14} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-[24px] h-[24px] rounded-full border-2 border-[#EDE5DE] bg-white"></div>
                    )}
                  </button>
                  <div className={`w-[24px] h-[24px] rounded-full flex items-center justify-center flex-shrink-0
                    ${i === 0 ? 'bg-[#B8472A] text-white font-bold' : 
                      i === 1 ? 'bg-[#D4795C] text-white font-bold' : 
                      'bg-[#F5E8E4] text-[#B8472A] font-bold'}`}>
                    {i + 1}
                  </div>
                  <span className={`text-[14px] flex-1 ${p.completed ? 'text-[#9C8880] line-through' : 'text-[#1A1210]'}`}>
                    {p.text}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="text-[13px] text-[#9C8880] mb-8 px-1">{prioritiesCompleted} of {priorities.length} priorities completed</div>

          {/* Top Tasks */}
          <div className="mb-4">
            <h3 className="text-[13px] font-semibold text-[#9C8880] uppercase tracking-wider mb-3">Completed today</h3>
            <div className="flex flex-col gap-3">
              {completedTasks.slice(0, 3).map((t, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-[20px] h-[20px] rounded-full bg-[#E8F5E9] flex items-center justify-center flex-shrink-0">
                    <Check size={12} className="text-[#1A7A4A]" />
                  </div>
                  <span className="text-[14px] text-[#1A1210] flex-1 truncate">{t.name}</span>
                  <span className="text-[12px] text-[#9C8880]">{t.duration}</span>
                </div>
              ))}
              {completedTasks.length > 3 && (
                <button className="text-[13px] text-[#B8472A] text-left mt-2">See all {completedTasks.length}</button>
              )}
            </div>
          </div>
        </div>

        <div className="mt-auto pt-4">
          <button 
            onClick={nextStep}
            className="w-full h-[52px] rounded-[100px] text-white font-semibold text-[16px] transition-all bg-gradient-to-b from-[#D4795C] to-[#B8472A] shadow-md active:scale-[0.98]"
          >
            Continue &rarr;
          </button>
        </div>
      </div>
    );
  };

  const renderStep2 = () => {
    const predefinedTags = ["Time management", "Distractions", "Low energy", "Unclear priorities", "Too many meetings", "Personal"];

    const toggleTag = (tag: string) => {
      if (challengeTags.includes(tag)) {
        setChallengeTags(challengeTags.filter(t => t !== tag));
      } else {
        setChallengeTags([...challengeTags, tag]);
        if (!challenge.includes(tag)) {
          setChallenge(prev => prev ? `${prev}, ${tag}` : tag);
        }
      }
    };

    const moodOptions = [
      { value: 1, emoji: '😞', label: 'Rough' },
      { value: 2, emoji: '😕', label: 'Meh' },
      { value: 3, emoji: '😐', label: 'Okay' },
      { value: 4, emoji: '🙂', label: 'Good' },
      { value: 5, emoji: '😄', label: 'Amazing' },
    ];

    let moodNote = null;
    // Assuming morning energy was around 3 for this comparison mock
    const morningEnergy = 3; 
    if (moodRating) {
      if (moodRating > morningEnergy) {
        moodNote = <div className="text-[13px] text-[#1A7A4A] mt-3">You finished stronger than you started! 🌟</div>;
      } else if (moodRating < morningEnergy) {
        moodNote = <div className="text-[13px] text-[#C47F1A] mt-3">Tough day — tomorrow is a fresh start 🌱</div>;
      } else {
        moodNote = <div className="text-[13px] text-[#9C8880] mt-3">Consistent energy today ✓</div>;
      }
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
        <div className="pt-[40px] pb-6 text-center flex-shrink-0">
          <h2 className="text-[22px] font-bold text-[#1A1210]">Take a moment to reflect</h2>
          <div className="text-[14px] text-[#9C8880] mt-1">Just 3 quick questions</div>
        </div>

        <div className="flex-1 flex flex-col gap-8">
          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">What was your biggest win today?</h3>
            <div className="relative">
              <textarea
                placeholder="Something you accomplished or are proud of..."
                value={biggestWin}
                maxLength={300}
                onChange={e => setBiggestWin(e.target.value)}
                className="w-full min-h-[88px] bg-white border border-[#EDE5DE] rounded-[12px] p-3 text-[14px] text-[#1A1210] resize-none focus:outline-none focus:border-[#B8472A]"
              />
              <div className="absolute bottom-2 right-3 text-[12px] text-[#9C8880]">
                {biggestWin.length}/300
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">What challenged you today?</h3>
            <textarea
              placeholder="An obstacle or difficulty you faced..."
              value={challenge}
              onChange={e => setChallenge(e.target.value)}
              className="w-full min-h-[88px] bg-white border border-[#EDE5DE] rounded-[12px] p-3 text-[14px] text-[#1A1210] resize-none focus:outline-none focus:border-[#B8472A] mb-3"
            />
            <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
              {predefinedTags.map(tag => {
                const isSelected = challengeTags.includes(tag);
                return (
                  <button
                    key={tag}
                    onClick={() => toggleTag(tag)}
                    className={`flex-shrink-0 rounded-[100px] px-[14px] py-[6px] text-[13px] border transition-colors whitespace-nowrap
                      ${isSelected ? 'bg-[#F5E8E4] border-[#B8472A] text-[#B8472A]' : 'bg-white border-[#EDE5DE] text-[#6B5C54]'}`}
                  >
                    {tag}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-4">How do you feel ending the day?</h3>
            <div className="flex justify-between items-center">
              {moodOptions.map((opt) => (
                <button
                  key={`mood-${opt.value}`}
                  onClick={() => setMoodRating(opt.value)}
                  className={`flex flex-col items-center gap-2 transition-all duration-150 ${moodRating === opt.value ? 'scale-105' : ''}`}
                >
                  <div className={`w-[56px] h-[56px] rounded-[16px] flex items-center justify-center text-[28px] transition-colors
                    ${moodRating === opt.value 
                      ? 'bg-[#F5E8E4] border-2 border-[#B8472A]' 
                      : 'bg-[#FFFFFF] border border-[#EDE5DE]'}`}
                  >
                    {opt.emoji}
                  </div>
                  <span className="text-[11px] text-[#9C8880]">{opt.label}</span>
                </button>
              ))}
            </div>
            {moodNote && <div className="text-center">{moodNote}</div>}
          </div>

          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">One thing you're grateful for today</h3>
            <input
              type="text"
              placeholder="Optional — a small moment of gratitude..."
              value={gratitude}
              maxLength={150}
              onChange={e => setGratitude(e.target.value)}
              className="w-full h-[52px] bg-white border border-[#EDE5DE] rounded-[12px] px-4 text-[14px] text-[#1A1210] focus:outline-none focus:border-[#B8472A]"
            />
          </div>

          <button 
            disabled={!biggestWin.trim() || !moodRating}
            onClick={nextStep}
            className={`w-full h-[52px] mt-2 rounded-[100px] font-semibold text-[16px] transition-all
              ${(!biggestWin.trim() || !moodRating) 
                ? 'bg-[#E5D5C5] text-[#9C8880] cursor-not-allowed' 
                : 'bg-gradient-to-b from-[#D4795C] to-[#B8472A] text-white shadow-[0_2px_4px_rgba(184,71,42,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]'
              }`}
          >
            Continue &rarr;
          </button>
        </div>
      </div>
    );
  };

  const renderStep3 = () => {
    const handleReschedule = async (taskId: string, date: string) => {
      await scheduleApi.rescheduleTask(taskId, date);
      setUnfinishedTasks(prev => prev.filter(t => t.id !== taskId));
    };

    const handleRemove = async (taskId: string) => {
      if (confirm('Are you sure you want to remove this task?')) {
        // Mock remove
        setUnfinishedTasks(prev => prev.filter(t => t.id !== taskId));
      }
    };

    const setTomPriority = (index: number, value: string) => {
      const newP = [...tomorrowPriorities];
      newP[index] = value;
      setTomorrowPriorities(newP);
    };

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
        <div className="pt-[40px] pb-6 text-center flex-shrink-0">
          <h2 className="text-[22px] font-bold text-[#1A1210]">Set up for tomorrow</h2>
          <div className="text-[14px] text-[#6B5C54] mt-1">A little planning now = a great day tomorrow</div>
        </div>

        <div className="flex-1 flex flex-col gap-8">
          
          {/* Unfinished Tasks */}
          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-4">Unfinished from today</h3>
            {unfinishedTasks.length > 0 ? (
              <div className="flex flex-col gap-3">
                {unfinishedTasks.map(task => (
                  <div key={task.id} className="bg-white border border-[#EDE5DE] rounded-[12px] p-3 flex flex-col gap-3 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="text-[14px] font-medium text-[#1A1210]">{task.name}</span>
                      <span className="text-[12px] bg-[#F2EDE8] px-2 py-1 rounded-md text-[#6B5C54]">{task.duration}</span>
                    </div>
                    <div className="flex items-center gap-2 justify-end border-t border-[#EDE5DE] pt-3">
                      <button onClick={() => handleReschedule(task.id, 'tomorrow')} className="flex items-center gap-1 text-[13px] text-[#1A1210] bg-[#FAF6F2] px-3 py-1.5 rounded-full hover:bg-[#EDE5DE] transition-colors">
                        <ArrowRight size={14} /> Tomorrow
                      </button>
                      <button onClick={() => handleReschedule(task.id, 'someday')} className="flex items-center gap-1 text-[13px] text-[#6B5C54] bg-[#FAF6F2] px-3 py-1.5 rounded-full hover:bg-[#EDE5DE] transition-colors">
                        <Clock size={14} /> Later
                      </button>
                      <button onClick={() => handleRemove(task.id)} className="flex items-center gap-1 text-[13px] text-[#C0392B] bg-[#FDF0F0] px-3 py-1.5 rounded-full hover:bg-[#FADBD8] transition-colors">
                        <Trash2 size={14} /> Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-[#F0FAF4] border border-[#A8D5B5] rounded-[12px] p-4 text-center">
                <div className="text-[16px] font-bold text-[#1A7A4A] mb-1">You finished everything! 🎉</div>
                <div className="text-[14px] text-[#6B5C54]">All tasks complete — great discipline today.</div>
              </div>
            )}
          </div>

          {/* Tomorrow's Priorities */}
          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-4">Top priorities for tomorrow</h3>
            <div className="flex flex-col gap-4">
              {[0, 1, 2].map(i => (
                <div key={i} className="flex items-center gap-3">
                  <div className={`w-[24px] h-[24px] rounded-full flex items-center justify-center flex-shrink-0
                    ${i === 0 ? 'bg-[#B8472A] text-white font-bold' : 
                      i === 1 ? 'bg-[#D4795C] text-white font-bold' : 
                      'bg-[#F5E8E4] text-[#B8472A] font-bold'}`}>
                    {i + 1}
                  </div>
                  <input
                    type="text"
                    value={tomorrowPriorities[i]}
                    onChange={e => setTomPriority(i, e.target.value)}
                    placeholder={i === 0 ? "Most important thing tomorrow..." : i === 1 ? "Second priority..." : "Third priority (optional)..."}
                    className="flex-1 h-[52px] bg-white border border-[#EDE5DE] rounded-[12px] px-4 text-[15px] text-[#1A1210] placeholder:text-[#9C8880] focus:outline-none focus:border-[#B8472A]"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Tomorrow's Schedule Preview */}
          <div>
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-3">Tomorrow's schedule</h3>
            <div className="bg-white border border-[#EDE5DE] rounded-[12px] p-4 shadow-sm">
              <div className="text-[13px] text-[#9C8880] mb-3">0 tasks · 0h 0m total</div>
              <button onClick={() => navigate('tasks')} className="w-full h-[44px] rounded-[10px] bg-[#FAF6F2] text-[#B8472A] font-semibold text-[14px] hover:bg-[#F5E8E4] transition-colors border border-[#EDE5DE]">
                Add task for tomorrow
              </button>
            </div>
          </div>

          {/* Wind down suggestion */}
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] p-5 shadow-[0_2px_8px_rgba(26,18,16,0.06)] relative overflow-hidden">
            <Moon size={24} className="absolute top-4 right-4 text-[#D4920A] opacity-20" />
            <h3 className="text-[15px] font-semibold text-[#1A1210] mb-2">Tonight's wind-down</h3>
            <p className="text-[14px] text-[#6B5C54] mb-4">
              You have a deep work session at 9 AM tomorrow. Try to be in bed by 10:30 PM for 8 hours of sleep.
            </p>
            <div className="flex items-center justify-between border-t border-[#EDE5DE] pt-4">
              <span className="text-[14px] font-medium text-[#1A1210]">Set sleep reminder</span>
              <button 
                onClick={() => {
                  setSleepReminder(!sleepReminder);
                  if (!sleepReminder) scheduleApi.setSleepReminder('22:30');
                }}
                className={`w-11 h-6 rounded-full relative transition-colors ${sleepReminder ? 'bg-[#1A7A4A]' : 'bg-[#EDE5DE]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-[2px] transition-transform ${sleepReminder ? 'left-[22px]' : 'left-[2px]'}`}></div>
              </button>
            </div>
          </div>

          <button 
            onClick={nextStep}
            className="w-full h-[52px] mt-2 rounded-[100px] text-white font-semibold text-[16px] transition-all bg-gradient-to-b from-[#D4795C] to-[#B8472A] shadow-md active:scale-[0.98]"
          >
            Almost done &rarr;
          </button>
        </div>
      </div>
    );
  };

  const renderStep4 = () => {
    // Determine dynamic headline
    let headline = `Solid day, ${useAuthStore.getState().userName || 'there'}! 💪`;
    if (priorities.every(p => p.completed)) {
      headline = "You crushed it today! 🏆";
    } else if (priorities.filter(p => p.completed).length === 0) {
      headline = "Rest up, tomorrow's fresh 🌙";
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 pb-8 relative">
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50 overflow-hidden">
            {[...Array(12)].map((_, i) => (
              <div 
                key={i} 
                className="absolute w-3 h-3 rounded-full animate-confetti"
                style={{
                  backgroundColor: i % 3 === 0 ? '#B8472A' : (i % 3 === 1 ? '#D4920A' : '#1A7A4A'),
                  left: `calc(50% + ${(Math.random() - 0.5) * 250}px)`,
                  top: `calc(50% + ${(Math.random() - 0.5) * 250}px)`,
                  animationDelay: `${Math.random() * 0.2}s`,
                }}
              />
            ))}
          </div>
        )}

        <div className="pt-[40px] pb-8 flex flex-col items-center flex-shrink-0">
          <div className="w-[120px] h-[120px] rounded-full bg-[#F5E8E4] mb-6 flex items-center justify-center text-[48px]">
            🦊
          </div>
          <h2 className="text-[26px] font-bold text-[#1A1210]">{headline}</h2>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          
          {/* AI Coach Insights Card */}
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] p-5 shadow-[0_2px_8px_rgba(26,18,16,0.06)]">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[20px]">🦊</span>
              <span className="text-[14px] font-semibold text-[#1A1210]">AI Coach</span>
            </div>
            <p className="text-[15px] text-[#6B5C54] leading-[1.5]">
              Your focus was highest between 10-12 PM today. You've now maintained a 7-day streak — incredible consistency! Tomorrow, I've scheduled your hardest task during your peak focus window.
            </p>
          </div>

          {/* Tomorrow at a Glance */}
          <div>
            <div className="flex justify-between items-baseline mb-3">
              <h3 className="text-[17px] font-semibold text-[#1A1210]">Tomorrow</h3>
              <span className="text-[13px] text-[#9C8880]">Thursday, May 2</span>
            </div>
            <div className="bg-white border border-[#EDE5DE] rounded-[12px] p-4 shadow-sm flex flex-col gap-3">
              {tomorrowPriorities.filter(p => p.trim() !== '').map((p, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="w-[20px] h-[20px] rounded-full bg-[#F5E8E4] text-[#B8472A] text-[10px] font-bold flex items-center justify-center">{i + 1}</div>
                  <span className="text-[14px] text-[#1A1210] truncate">{p}</span>
                </div>
              ))}
              <div className="flex items-center justify-between border-t border-[#EDE5DE] pt-3 mt-1">
                <span className="text-[13px] text-[#9C8880]">3 tasks scheduled</span>
                <span className="text-[13px] text-[#B8472A]">Starts at 9:00 AM</span>
              </div>
              <div className="bg-[#F0FAF4] rounded-lg p-2 flex items-center gap-2 mt-1">
                <span className="text-[14px]">🎯</span>
                <span className="text-[13px] text-[#1A7A4A] font-medium">Focus block: 9-11 AM protected</span>
              </div>
            </div>
          </div>

          {/* Achievement Unlocked */}
          <div className="relative overflow-hidden rounded-[16px] p-4 border border-[#EDE5DE] bg-gradient-to-br from-[#F5E8E4] to-[#FAF6F2]">
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/50 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }}></div>
            <div className="relative z-10 flex items-start gap-4">
              <div className="text-[32px] drop-shadow-sm">🏆</div>
              <div>
                <div className="text-[13px] font-semibold text-[#D4920A] uppercase tracking-wider mb-1">Achievement Unlocked!</div>
                <div className="text-[17px] font-bold text-[#1A1210] mb-1">Consistent Reviewer</div>
                <div className="text-[13px] text-[#6B5C54]">Completed evening reviews 7 days in a row.</div>
              </div>
            </div>
          </div>

          <div className="mt-4 pb-4">
            <button 
              onClick={handleComplete}
              disabled={submitting}
              className={`w-full h-[56px] rounded-[100px] text-white font-semibold text-[17px] transition-all bg-gradient-to-b from-[#D4795C] to-[#B8472A] shadow-[0_4px_12px_rgba(184,71,42,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98] active:shadow-none flex items-center justify-center gap-2 ${submitting ? 'opacity-80' : ''}`}
            >
              {submitting ? 'Saving...' : 'Rest Well 🌙'}
            </button>
            <div className="text-center mt-4">
              <button onClick={() => navigate('home')} className="text-[14px] text-[#9C8880]">
                Skip for tonight
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="fixed inset-0 bg-[#FAF6F2] font-sans flex flex-col z-50">
      <style>{`
        @keyframes confetti-burst {
          0% { transform: translateY(0) scale(1) rotate(0deg); opacity: 1; }
          100% { transform: translateY(-120px) scale(0) rotate(180deg); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-burst 0.8s cubic-bezier(0.25, 0.46, 0.45, 0.94) forwards;
        }
        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
        .animate-shimmer {
          animation: shimmer 3s infinite linear;
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
      
      {/* Header */}
      <div className="h-[54px] flex-shrink-0" aria-hidden="true" />
      <div className="h-[56px] flex items-center justify-between px-4 flex-shrink-0 relative mb-2">
        <div className="w-[40px]">
          {step > 1 && (
            <button 
              onClick={prevStep}
              className="p-2 -ml-2 rounded-full hover:bg-[#F2EDE8] transition-colors"
            >
              <ArrowLeft size={24} className="text-[#1A1210]" />
            </button>
          )}
        </div>
        
        <div className="flex-1 text-center flex flex-col items-center">
          <div className="flex items-center gap-1.5 mb-2">
            <Moon size={14} className="text-[#1A1210]" />
            <span className="text-[17px] font-semibold text-[#1A1210]">Evening Review</span>
          </div>
          {/* Progress Bar */}
          <div className="w-full max-w-[120px] h-[4px] bg-[#EDE5DE] rounded-[100px] overflow-hidden">
            <div 
              className="h-full bg-[#B8472A] transition-all duration-400 ease-in-out"
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
        </div>

        <div className="w-[40px] flex justify-end">
          <button 
            onClick={() => navigate('home')}
            className="p-2 -mr-2 rounded-full hover:bg-[#F2EDE8] transition-colors"
          >
            <X size={24} className="text-[#1A1210]" />
          </button>
        </div>
      </div>

      {/* Content wrapper with basic slide animation classes */}
      <div className="flex-1 relative overflow-hidden">
        <div 
          className="absolute inset-0 flex transition-transform duration-300 ease-in-out h-full"
          style={{ width: '400%', transform: `translateX(-${(step - 1) * 25}%)` }}
        >
          <div className="w-1/4 h-full">{renderStep1()}</div>
          <div className="w-1/4 h-full">{renderStep2()}</div>
          <div className="w-1/4 h-full">{renderStep3()}</div>
          <div className="w-1/4 h-full">{renderStep4()}</div>
        </div>
      </div>
    </div>
  );
}

function Check({ size, className }: { size: number, className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <polyline points="20 6 9 17 4 12"></polyline>
    </svg>
  )
}
