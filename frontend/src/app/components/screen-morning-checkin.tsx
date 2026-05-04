import React, { useState, useEffect } from 'react';
import { ArrowLeft, X } from 'lucide-react';
import { scheduleApi } from '../../api/scheduleApi';
import { useAuthStore } from '../../stores/authStore';

interface Props {
  navigate: (screen: string) => void;
}

export default function ScreenMorningCheckin({ navigate }: Props) {
  const [step, setStep] = useState(1);
  const [energyLevel, setEnergyLevel] = useState<number | null>(null);
  const [sleepQuality, setSleepQuality] = useState<number | null>(null);
  const [sleepHours, setSleepHours] = useState<string>('');
  const [moodNote, setMoodNote] = useState('');
  
  const [priorities, setPriorities] = useState(['', '', '']);
  const [showFourthPriority, setShowFourthPriority] = useState(false);
  const [intention, setIntention] = useState('');
  
  const [todaysTasks, setTodaysTasks] = useState<any[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  const [blockFocus, setBlockFocus] = useState(true);

  useEffect(() => {
    const fetchTasks = async () => {
      try {
        const today = new Date().toISOString().split('T')[0];
        const tasks = await scheduleApi.getTasks(today);
        setTodaysTasks(tasks || []);
      } catch (err) {
        console.error('Failed to load tasks', err);
        setTodaysTasks([]);
      }
    };
    fetchTasks();
  }, []);

  const handleComplete = async () => {
    setSubmitting(true);
    try {
      const today = new Date().toISOString().split('T')[0];
      await scheduleApi.saveMorningCheckin({
        energy_level: energyLevel || 3,
        sleep_quality: sleepQuality || 3,
        sleep_hours: parseFloat(sleepHours) || 0,
        mood_note: moodNote,
        priorities: priorities.filter(p => p.trim() !== ''),
        intention,
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

  const nextStep = () => setStep(s => Math.min(s + 1, 4));
  const prevStep = () => setStep(s => Math.max(s - 1, 1));

  // Dynamic greeting
  const hour = new Date().getHours();
  let greeting = 'Good evening 🌙';
  if (hour >= 5 && hour < 12) greeting = 'Good morning ☀️';
  else if (hour >= 12 && hour < 17) greeting = 'Good afternoon 🌤️';

  // Energy & Sleep Options
  const energyOptions = [
    { value: 1, emoji: '😴', label: 'Exhausted' },
    { value: 2, emoji: '😕', label: 'Low' },
    { value: 3, emoji: '😐', label: 'Okay' },
    { value: 4, emoji: '🙂', label: 'Good' },
    { value: 5, emoji: '🚀', label: 'Energized' },
  ];

  const sleepOptions = [
    { value: 1, emoji: '😫', label: 'Terrible' },
    { value: 2, emoji: '😞', label: 'Poor' },
    { value: 3, emoji: '😴', label: 'Okay' },
    { value: 4, emoji: '😊', label: 'Good' },
    { value: 5, emoji: '✨', label: 'Great' },
  ];

  const renderStep1 = () => (
    <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
      <div className="pt-[60px] pb-8 text-center flex-shrink-0">
        <div className="text-[15px] font-medium text-[#6B5C54] mb-1">{greeting}</div>
        <div className="text-[28px] font-bold text-[#1A1210]">{useAuthStore.getState().userName || 'there'}</div>
        <div className="text-[17px] text-[#6B5C54] mt-2">How are you feeling today?</div>
      </div>

      <div className="flex-1 flex flex-col gap-8">
        <div>
          <label className="block text-[15px] font-semibold text-[#1A1210] mb-4">Energy Level</label>
          <div className="flex justify-between items-center">
            {energyOptions.map((opt) => (
              <button
                key={`energy-${opt.value}`}
                onClick={() => setEnergyLevel(opt.value)}
                className={`flex flex-col items-center gap-2 transition-all duration-150 ${energyLevel === opt.value ? 'scale-105' : ''}`}
              >
                <div className={`w-[56px] h-[56px] rounded-[16px] flex items-center justify-center text-[28px] transition-colors
                  ${energyLevel === opt.value 
                    ? 'bg-[#F5E8E4] border-2 border-[#B8472A]' 
                    : 'bg-[#FFFFFF] border border-[#EDE5DE]'}`}
                >
                  {opt.emoji}
                </div>
                <span className="text-[11px] text-[#9C8880]">{opt.label}</span>
              </button>
            ))}
          </div>
          {energyLevel && (
            <div className="text-center mt-3 text-[15px] text-[#B8472A] font-medium">
              {energyOptions.find(o => o.value === energyLevel)?.label} today! {energyOptions.find(o => o.value === energyLevel)?.emoji}
            </div>
          )}
        </div>

        <div>
          <label className="block text-[15px] font-semibold text-[#1A1210] mb-4">Sleep Quality</label>
          <div className="flex justify-between items-center mb-6">
            {sleepOptions.map((opt) => (
              <button
                key={`sleep-${opt.value}`}
                onClick={() => setSleepQuality(opt.value)}
                className={`flex flex-col items-center gap-2 transition-all duration-150 ${sleepQuality === opt.value ? 'scale-105' : ''}`}
              >
                <div className={`w-[56px] h-[56px] rounded-[16px] flex items-center justify-center text-[28px] transition-colors
                  ${sleepQuality === opt.value 
                    ? 'bg-[#F5E8E4] border-2 border-[#B8472A]' 
                    : 'bg-[#FFFFFF] border border-[#EDE5DE]'}`}
                >
                  {opt.emoji}
                </div>
                <span className="text-[11px] text-[#9C8880]">{opt.label}</span>
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 mt-4">
            <label className="text-[13px] text-[#6B5C54] flex-1">Hours slept (optional)</label>
            <div className="relative flex items-center gap-2">
              <input 
                type="number" 
                min="0" max="12" step="0.5"
                placeholder="7.5"
                value={sleepHours}
                onChange={e => setSleepHours(e.target.value)}
                className="h-[44px] w-[120px] rounded-[12px] border border-[#EDE5DE] bg-white text-center text-[#1A1210] text-[15px] focus:outline-none focus:border-[#B8472A]"
              />
              <span className="text-[13px] text-[#9C8880]">hrs</span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-[13px] text-[#6B5C54] mb-2">Anything on your mind?</label>
          <div className="relative">
            <textarea
              placeholder="Optional — a quick note about how you're feeling..."
              value={moodNote}
              maxLength={200}
              onChange={e => setMoodNote(e.target.value)}
              className="w-full min-h-[80px] bg-white border border-[#EDE5DE] rounded-[12px] p-3 text-[14px] text-[#1A1210] resize-none focus:outline-none focus:border-[#B8472A]"
            />
            <div className="absolute bottom-2 right-3 text-[12px] text-[#9C8880]">
              {moodNote.length}/200
            </div>
          </div>
        </div>

        <button 
          disabled={!energyLevel}
          onClick={nextStep}
          className={`w-full h-[52px] mt-8 rounded-[100px] font-semibold text-[16px] transition-all
            ${!energyLevel 
              ? 'bg-[#E5D5C5] text-[#9C8880] cursor-not-allowed' 
              : 'bg-gradient-to-b from-[#D4795C] to-[#B8472A] text-white shadow-[0_2px_4px_rgba(184,71,42,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]'
            }`}
        >
          Continue &rarr;
        </button>
      </div>
    </div>
  );

  const setPriority = (index: number, value: string) => {
    const newP = [...priorities];
    newP[index] = value;
    setPriorities(newP);
  };

  const handleTaskQuickAdd = (taskName: string) => {
    const emptyIndex = priorities.findIndex(p => p.trim() === '');
    if (emptyIndex !== -1) {
      setPriority(emptyIndex, taskName);
    } else {
      setPriority(0, taskName);
    }
  };

  const renderStep2 = () => (
    <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
      <div className="pt-[40px] pb-6 text-center flex-shrink-0">
        <h2 className="text-[22px] font-bold text-[#1A1210]">What are your top 3 priorities today?</h2>
        <div className="text-[14px] text-[#6B5C54] mt-1">Focus on what matters most</div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        {todaysTasks.length > 0 && (
          <div>
            <label className="block text-[13px] text-[#9C8880] mb-2">From your schedule today:</label>
            <div className="flex overflow-x-auto gap-2 pb-2 -mx-4 px-4 scrollbar-hide">
              {todaysTasks.map((t, i) => {
                const isSelected = priorities.includes(t.title);
                return (
                  <button
                    key={i}
                    onClick={() => handleTaskQuickAdd(t.title)}
                    className={`flex-shrink-0 rounded-[100px] px-[14px] py-[8px] text-[13px] border transition-colors whitespace-nowrap
                      ${isSelected ? 'bg-[#F5E8E4] border-[#B8472A] text-[#B8472A]' : 'bg-white border-[#EDE5DE] text-[#1A1210]'}`}
                  >
                    {t.title}
                  </button>
                );
              })}
            </div>
          </div>
        )}

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
                value={priorities[i]}
                onChange={e => setPriority(i, e.target.value)}
                placeholder={i === 0 ? "Most important thing today..." : i === 1 ? "Second priority..." : "Third priority..."}
                className="flex-1 h-[52px] bg-white border border-[#EDE5DE] rounded-[12px] px-4 text-[15px] text-[#1A1210] placeholder:text-[#9C8880] focus:outline-none focus:border-[#B8472A]"
              />
            </div>
          ))}
          {showFourthPriority ? (
            <div className="flex items-center gap-3">
              <div className="w-[24px] h-[24px] rounded-full bg-[#FAF6F2] text-[#9C8880] font-bold flex items-center justify-center flex-shrink-0">
                4
              </div>
              <input
                type="text"
                placeholder="Optional fourth priority..."
                className="flex-1 h-[52px] bg-white border border-[#EDE5DE] rounded-[12px] px-4 text-[15px] text-[#1A1210] placeholder:text-[#9C8880] focus:outline-none focus:border-[#B8472A]"
              />
            </div>
          ) : (
            <button 
              onClick={() => setShowFourthPriority(true)}
              className="text-[14px] text-[#B8472A] font-medium text-left ml-[36px]"
            >
              + Add another priority
            </button>
          )}
        </div>

        <div className="mt-2">
          <label className="block text-[13px] text-[#6B5C54] mb-2">Set an intention (optional)</label>
          <input
            type="text"
            value={intention}
            onChange={e => setIntention(e.target.value)}
            placeholder="Today I will focus on..."
            className="w-full h-[52px] bg-white border border-[#EDE5DE] rounded-[12px] px-4 text-[15px] text-[#1A1210] placeholder:text-[#9C8880] focus:outline-none focus:border-[#B8472A]"
          />
        </div>

        <button 
          disabled={!priorities[0].trim()}
          onClick={nextStep}
          className={`w-full h-[52px] mt-8 rounded-[100px] font-semibold text-[16px] transition-all
            ${!priorities[0].trim() 
              ? 'bg-[#E5D5C5] text-[#9C8880] cursor-not-allowed' 
              : 'bg-gradient-to-b from-[#D4795C] to-[#B8472A] text-white shadow-[0_2px_4px_rgba(184,71,42,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]'
            }`}
        >
          Continue &rarr;
        </button>
      </div>
    </div>
  );

  const renderStep3 = () => (
    <div className="flex flex-col h-full overflow-y-auto px-4 pb-8">
      <div className="pt-[40px] pb-6 flex-shrink-0 text-center">
        <h2 className="text-[22px] font-bold text-[#1A1210]">Here's your day ahead</h2>
        <div className="text-[14px] text-[#9C8880] mt-1">{new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</div>
      </div>

      <div className="flex-1 flex flex-col gap-6">
        
        {/* Focus Time Card */}
        <div className="bg-white border-y border-r border-l-0 border-[#EDE5DE] rounded-[12px] shadow-[0_2px_8px_rgba(26,18,16,0.06)] relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#B8472A]"></div>
          <div className="p-4 pl-5">
            <div className="flex justify-between items-start mb-2">
              <div className="flex items-center gap-2">
                <span className="text-[20px]">⚡</span>
                <span className="text-[13px] font-semibold text-[#1A1210]">Best focus window</span>
              </div>
              
              {/* Toggle switch */}
              <button 
                onClick={() => {
                  setBlockFocus(!blockFocus);
                  if (!blockFocus && scheduleApi.blockFocusTime) {
                    scheduleApi.blockFocusTime('09:00', '11:00');
                  }
                }}
                className={`w-11 h-6 rounded-full relative transition-colors ${blockFocus ? 'bg-[#B8472A]' : 'bg-[#EDE5DE]'}`}
              >
                <div className={`w-5 h-5 bg-white rounded-full absolute top-[2px] transition-transform ${blockFocus ? 'left-[22px]' : 'left-[2px]'}`}></div>
              </button>
            </div>
            <div className="text-[17px] font-bold text-[#B8472A] mb-1">9:00 AM — 11:00 AM</div>
            <div className="text-[12px] text-[#9C8880]">Based on your energy patterns</div>
          </div>
        </div>

        {/* Energy Match Alert */}
        {energyLevel && energyLevel <= 2 && (
          <div className="bg-[#FEF9EE] border border-[#F0D090] rounded-[12px] p-4 flex items-start gap-3">
            <span className="text-[20px] leading-none">⚠️</span>
            <div>
              <div className="text-[14px] font-semibold text-[#1A1210] mb-1">Low energy day detected</div>
              <div className="text-[14px] text-[#6B5C54] leading-relaxed">
                We've moved your deep work to tomorrow and kept only essential tasks for today.
              </div>
            </div>
          </div>
        )}

        {energyLevel && energyLevel >= 4 && (
          <div className="bg-[#F0FAF4] border border-[#A8D5B5] rounded-[12px] p-4 flex items-start gap-3">
            <span className="text-[20px] leading-none">🚀</span>
            <div>
              <div className="text-[14px] font-semibold text-[#1A1210] mb-1">You're energized!</div>
              <div className="text-[14px] text-[#6B5C54] leading-relaxed">
                Great day for deep work. Your hardest task is scheduled first.
              </div>
            </div>
          </div>
        )}

        {/* Task List */}
        <div>
          <h3 className="text-[15px] font-semibold text-[#1A1210] mb-4">Scheduled tasks</h3>
          
          {todaysTasks.length === 0 ? (
            <div className="py-6 text-center border border-dashed border-[#EDE5DE] rounded-[12px] bg-white">
              <div className="text-[14px] text-[#6B5C54] mb-3">No tasks scheduled</div>
              <button 
                onClick={() => navigate('tasks')}
                className="text-[14px] text-[#B8472A] font-medium"
              >
                + Add a task
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {todaysTasks.map((task, i) => (
                <div key={i} className={`flex items-center gap-3 ${task.status === 'completed' ? 'opacity-50' : ''}`}>
                  <div className="text-[12px] text-[#9C8880] w-[60px] flex-shrink-0">
                    {task.due_date ? new Date(task.due_date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : 'Anytime'}
                  </div>
                  <div className={`w-[8px] h-[8px] rounded-full ${task.status === 'completed' ? 'bg-[#9C8880]' : 'bg-[#B8472A]'}`}></div>
                  <div className={`text-[14px] flex-1 truncate ${task.status === 'completed' ? 'text-[#9C8880] line-through' : 'text-[#1A1210]'}`}>
                    {task.title}
                  </div>
                  <div className="text-[12px] text-[#9C8880] w-[40px] text-right flex-shrink-0">
                    {task.status === 'completed' ? '✓ Done' : '30m'}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          onClick={nextStep}
          className="w-full h-[52px] mt-8 rounded-[100px] text-white font-semibold text-[16px] transition-all bg-gradient-to-b from-[#D4795C] to-[#B8472A] shadow-[0_2px_4px_rgba(184,71,42,0.2),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98]"
        >
          Looks good &rarr;
        </button>
      </div>
    </div>
  );

  const renderStep4 = () => {
    let message = "Good morning! ☀️\nYou've got your priorities set and your schedule is ready. Your best focus window starts at 9 AM!";
    if (energyLevel && energyLevel >= 4) {
      message = "You're starting strong! 🚀\nYour focus window is protected and your top priority is scheduled first. Let's make today count!";
    } else if (energyLevel && energyLevel <= 2) {
      message = "Rest is part of the process 😴\nI've kept today light. Focus on just your #1 priority and let the rest wait.";
    }

    return (
      <div className="flex flex-col h-full overflow-y-auto px-4 pb-8 relative">
        {showConfetti && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center z-50 overflow-hidden">
            {[...Array(8)].map((_, i) => (
              <div 
                key={i} 
                className="absolute w-3 h-3 rounded-full animate-confetti"
                style={{
                  backgroundColor: i % 2 === 0 ? '#B8472A' : '#D4920A',
                  left: `calc(50% + ${(Math.random() - 0.5) * 200}px)`,
                  top: `calc(50% + ${(Math.random() - 0.5) * 200}px)`,
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
          <div className="bg-white border border-[#EDE5DE] rounded-[16px] p-5 shadow-[0_2px_8px_rgba(26,18,16,0.06)] relative max-w-sm w-full">
            <div className="absolute -top-[8px] left-1/2 -ml-[8px] w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-transparent border-b-white z-10"></div>
            <div className="absolute -top-[9px] left-1/2 -ml-[8px] w-0 h-0 border-l-[8px] border-r-[8px] border-b-[8px] border-transparent border-b-[#EDE5DE]"></div>
            <p className="text-[15px] text-[#6B5C54] leading-[1.5] whitespace-pre-line text-center">
              {message}
            </p>
            <div className="text-[13px] text-[#9C8880] italic mt-3 text-right">
              — AI Coach
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col gap-6">
          <div className="flex gap-3">
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-[0_2px_8px_rgba(26,18,16,0.04)] text-center">
              <div className="text-[20px] font-bold text-[#1A1210]">{todaysTasks.length}</div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-1">Tasks</div>
            </div>
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-[0_2px_8px_rgba(26,18,16,0.04)] text-center">
              <div className="text-[16px] font-bold text-[#1A1210] mt-[2px]">9-11<span className="text-[12px] font-normal">AM</span></div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-[6px]">Focus</div>
            </div>
            <div className="flex-1 bg-white border border-[#EDE5DE] rounded-[12px] p-3 shadow-[0_2px_8px_rgba(26,18,16,0.04)] text-center">
              <div className="text-[14px] font-bold text-[#1A1210] truncate mt-[3px]" title={priorities[0]}>{priorities[0] || 'None'}</div>
              <div className="text-[11px] text-[#9C8880] uppercase tracking-wider mt-[5px]">Priority</div>
            </div>
          </div>

          <div className="bg-white border-y border-r border-l-0 border-[#EDE5DE] rounded-[12px] shadow-[0_2px_8px_rgba(26,18,16,0.06)] relative overflow-hidden flex p-4 items-center gap-4">
            <div className="absolute left-0 top-0 bottom-0 w-[4px] bg-gradient-to-b from-[#D4920A] to-[#B8472A]"></div>
            <div className="text-[28px] pl-2">🔥</div>
            <div>
              <div className="text-[15px] font-bold text-[#D4920A] mb-1">7 Day Streak!</div>
              <div className="text-[13px] text-[#6B5C54]">You've checked in 7 days in a row. Keep it going!</div>
            </div>
          </div>

          <div className="mt-4">
            <button 
              onClick={handleComplete}
              disabled={submitting}
              className={`w-full h-[56px] rounded-[100px] text-white font-semibold text-[17px] transition-all bg-gradient-to-b from-[#D4795C] to-[#B8472A] shadow-[0_4px_12px_rgba(184,71,42,0.3),inset_0_1px_0_rgba(255,255,255,0.2)] active:scale-[0.98] flex items-center justify-center gap-2 ${submitting ? 'opacity-80' : ''}`}
            >
              {submitting ? 'Saving...' : 'Start My Day 🚀'}
            </button>
            <div className="text-center mt-4 pb-4">
              <button onClick={() => navigate('home')} className="text-[14px] text-[#9C8880]">
                Remind me later
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
          0% { transform: translateY(0) scale(1); opacity: 1; }
          100% { transform: translateY(-100px) scale(0); opacity: 0; }
        }
        .animate-confetti {
          animation: confetti-burst 0.8s ease-out forwards;
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
      <div className="h-[56px] flex items-center justify-between px-4 flex-shrink-0 relative">
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
        
        {/* Progress Bar */}
        <div className="flex-1 px-8">
          <div className="h-[4px] bg-[#EDE5DE] rounded-[100px] overflow-hidden">
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
