import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Moon, ThumbsUp, Check, X, Clock, Star, MessageSquare } from 'lucide-react';
import { client } from '../api/client';
import { useUIStore } from '../stores/uiStore';
import { useScheduleStore } from '../stores/scheduleStore';
import type { TaskDetail } from '../api/scheduleApi';

interface TaskReviewState {
  task_id: string;
  status: 'completed' | 'partial' | 'skipped' | 'rescheduled';
  quality_rating: number;
  actual_duration_mins: number;
}

export default function EveningReviewPage() {
  const navigate = useNavigate();
  const { schedule, isLoading } = useScheduleStore();
  const fetchTodaySchedule = useScheduleStore(s => s.fetchSchedule);
  const [step, setStep] = useState(1);
  const [mood, setMood] = useState(3);
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [reviews, setReviews] = useState<Record<string, TaskReviewState>>({});

  useEffect(() => {
    fetchTodaySchedule();
  }, [fetchTodaySchedule]);

  const reviewTasks = useMemo(() => schedule?.tasks || [], [schedule?.tasks]);

  useEffect(() => {
    if (reviewTasks) {
      const initialReviews: Record<string, TaskReviewState> = {};
      reviewTasks.forEach(task => {
        initialReviews[task.id] = {
          task_id: task.id,
          status: 'completed',
          quality_rating: 4,
          actual_duration_mins: task.duration_mins
        };
      });
      setReviews(initialReviews);
    }
  }, [reviewTasks]);

  const updateTaskReview = (taskId: string, patch: Partial<TaskReviewState>) => {
    setReviews(prev => ({
      ...prev,
      [taskId]: { ...prev[taskId], ...patch }
    }));
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      await client.post('/checkin/evening', {
        task_completions: Object.values(reviews),
        mood_score: mood,
        evening_note: note
      });
      useUIStore.getState().addToast({ type: 'success', message: 'Day review complete! Sleep well.' });
      navigate('/home');
    } catch {
      useUIStore.getState().addToast({ type: 'error', message: 'Failed to submit evening review' });
    } finally {
      setSubmitting(false);
    }
  };

  if (isLoading) return <div className="p-8 text-center animate-pulse">Loading today's schedule...</div>;

  return (
    <div className="min-h-[85vh] max-w-2xl mx-auto p-6 animate-in fade-in duration-500 pb-24">
      <div className="flex items-center justify-center mb-8">
        <div className="bg-accent-primary/10 p-5 rounded-3xl text-accent-primary animate-pulse shadow-xl shadow-accent-primary/5">
          <Moon size={40} />
        </div>
      </div>

      <header className="text-center mb-10">
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">Evening Review</h1>
        <p className="text-text-secondary mt-2">Reflect on your progress and calibrate for tomorrow.</p>
      </header>

      {step === 1 && (
        <div className="space-y-6 animate-in slide-in-from-bottom-6 duration-500">
          <h2 className="text-sm font-bold uppercase tracking-widest text-text-tertiary px-2">Task Verification</h2>
          
          <div className="space-y-4">
            {reviewTasks.map((task: TaskDetail) => {
              const review = reviews[task.id];
              if (!review) return null;

              return (
                <div key={task.id} className="surface-card p-6 space-y-4 border-l-4 border-accent-primary">
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-bold text-lg text-text-primary">{task.title}</h3>
                      <p className="text-xs text-text-tertiary flex items-center gap-1 mt-1">
                        <Clock size={12} /> Scheduled: {task.duration_mins} mins
                      </p>
                    </div>
                    <div className="flex gap-1.5">
                      {(['completed', 'partial', 'skipped'] as const).map(s => (
                        <button
                          key={s}
                          onClick={() => updateTaskReview(task.id, { status: s })}
                          className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-tighter transition-all ${
                            review.status === s 
                              ? 'bg-accent-primary text-white shadow-lg shadow-accent-primary/20' 
                              : 'bg-bg-secondary text-text-tertiary hover:text-text-primary'
                          }`}
                        >
                          {s === 'completed' && <Check size={10} className="inline mr-1" />}
                          {s === 'skipped' && <X size={10} className="inline mr-1" />}
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>

                  {review.status !== 'skipped' && (
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border-subtle/50">
                      <div>
                        <label className="text-[10px] font-bold text-text-tertiary uppercase mb-1.5 block">Quality rating</label>
                        <div className="flex gap-1 text-accent-primary">
                          {[1, 2, 3, 4, 5].map(rating => (
                            <button key={rating} onClick={() => updateTaskReview(task.id, { quality_rating: rating })}>
                              <Star size={16} fill={review.quality_rating >= rating ? 'currentColor' : 'none'} className={review.quality_rating >= rating ? '' : 'text-text-tertiary'} />
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-bold text-text-tertiary uppercase mb-1.5 block">Actual mins</label>
                        <input 
                          type="number"
                          value={review.actual_duration_mins}
                          onChange={e => updateTaskReview(task.id, { actual_duration_mins: parseInt(e.target.value) || 0 })}
                          className="w-full bg-bg-secondary border-none rounded-lg px-2 py-1 text-sm font-bold text-text-primary focus:ring-1 ring-accent-primary transition-all"
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          <button 
            onClick={() => setStep(2)}
            className="w-full bg-accent-primary hover:brightness-110 text-white p-5 rounded-2xl font-bold text-lg transition-all shadow-xl shadow-accent-primary/20 active:scale-[0.98]"
          >
            Review Session Done
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-8 animate-in slide-in-from-right-12 duration-500">
          <section className="surface-card p-8 text-center bg-gradient-to-b from-bg-surface to-bg-primary">
            <h2 className="text-xl font-bold text-text-primary mb-6">How was your overall intensity?</h2>
            
            <div className="flex justify-between items-center max-w-sm mx-auto mb-8">
               {[1, 2, 3, 4, 5].map(rating => (
                 <button 
                   key={rating}
                   onClick={() => setMood(rating)}
                   className={`w-14 h-14 rounded-2xl transition-all flex items-center justify-center text-2xl ${
                     mood === rating 
                       ? 'bg-accent-primary text-white scale-110 shadow-xl shadow-accent-primary/20 rotate-3' 
                       : 'bg-bg-secondary text-text-tertiary hover:bg-bg-elevated grayscale'
                   }`}
                 >
                   {rating === 1 && '💀'}
                   {rating === 2 && '🔋'}
                   {rating === 3 && '⚡'}
                   {rating === 4 && '🔥'}
                   {rating === 5 && '👑'}
                 </button>
               ))}
            </div>

            <h3 className="text-sm font-bold text-text-tertiary uppercase tracking-widest mb-3 flex items-center justify-center gap-2">
              <MessageSquare size={14} /> Evening Note
            </h3>
            <textarea
              className="w-full h-40 bg-bg-secondary/50 border border-border-subtle rounded-3xl p-6 text-text-primary resize-none focus:outline-none focus:border-accent-primary transition-all italic text-lg shadow-inner"
              placeholder="What could have been better? Did you respect your buffers? Note for your future self..."
              value={note}
              onChange={e => setNote(e.target.value)}
            ></textarea>
          </section>
          
          <button 
            disabled={submitting}
            onClick={handleSubmit}
            className="w-full bg-accent-primary hover:brightness-110 text-white p-6 rounded-3xl font-bold text-xl flex justify-center gap-3 items-center disabled:opacity-50 transition-all shadow-2xl shadow-accent-primary/30"
          >
            <ThumbsUp size={24} />
            {submitting ? 'Archiving Day...' : 'Seal the Day'}
          </button>
          
          <div className="text-center pt-4">
            <button onClick={() => setStep(1)} className="text-xs font-bold uppercase tracking-widest text-text-tertiary hover:text-accent-primary transition-colors">
              Re-rate tasks
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
