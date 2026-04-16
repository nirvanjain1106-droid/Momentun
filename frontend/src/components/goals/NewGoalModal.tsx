import React from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Target, Calendar, MessageSquare, Award, AlertCircle } from 'lucide-react';
import { useGoalStore } from '../../stores/goalStore';
import { useUIStore } from '../../stores/uiStore';
import classes from './NewGoalModal.module.css';

const goalSchema = z.object({
  title: z.string().min(3, 'Goal title must be at least 3 characters'),
  goal_type: z.enum(['exam', 'fitness', 'skill', 'project', 'habit', 'other']),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().optional(),
  motivation: z.string().optional(),
  consequence: z.string().optional(),
  success_metric: z.string().optional(),
});

type GoalFormData = z.infer<typeof goalSchema>;

export const NewGoalModal: React.FC = () => {
  const { createGoal } = useGoalStore();
  const { closeModal, addToast } = useUIStore();
  
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<GoalFormData>({
    resolver: zodResolver(goalSchema),
    defaultValues: {
      goal_type: 'project',
      target_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
    },
  });

  const onSubmit = async (data: GoalFormData) => {
    try {
      const result = await createGoal(data);
      if (result.ok) {
        addToast({ type: 'success', message: 'Goal created successfully!' });
        closeModal();
      } else {
        addToast({ type: 'error', message: result.error?.message || 'Failed to create goal' });
      }
    } catch (error) {
      addToast({ type: 'error', message: 'An unexpected error occurred' });
    }
  };

  return (
    <div className={classes.overlay} onClick={closeModal}>
      <div className={classes.modal} onClick={(e) => e.stopPropagation()}>
        <div className={classes.header}>
          <div className={classes.titleGroup}>
            <div className={classes.iconBox}>
              <Target size={24} color="var(--accent-primary)" />
            </div>
            <div>
              <h2 className={classes.title}>Create New Goal</h2>
              <p className={classes.subtitle}>Set a clear target and stay focused.</p>
            </div>
          </div>
          <button className={classes.closeBtn} onClick={closeModal}>
            <X size={20} />
          </button>
        </div>

        <form className={classes.form} onSubmit={handleSubmit(onSubmit)}>
          <div className={classes.inputGroup}>
            <label className={classes.label}>What is your goal?</label>
            <div className={classes.inputWrapper}>
              <Target size={18} className={classes.fieldIcon} />
              <input
                {...register('title')}
                placeholder="e.g. Master Backend Engineering"
                className={`${classes.input} ${errors.title ? classes.inputError : ''}`}
                autoFocus
              />
            </div>
            {errors.title && <span className={classes.errorMsg}>{errors.title.message}</span>}
          </div>

          <div className={classes.row}>
            <div className={classes.inputGroup}>
              <label className={classes.label}>Category</label>
              <select {...register('goal_type')} className={classes.select}>
                <option value="exam">🎓 Exam</option>
                <option value="fitness">💪 Fitness</option>
                <option value="skill">🧠 Skill</option>
                <option value="project">🚀 Project</option>
                <option value="habit">🔄 Habit</option>
                <option value="other">✨ Other</option>
              </select>
            </div>

            <div className={classes.inputGroup}>
              <label className={classes.label}>Target Date</label>
              <div className={classes.inputWrapper}>
                <Calendar size={18} className={classes.fieldIcon} />
                <input
                  type="date"
                  {...register('target_date')}
                  className={`${classes.input} ${errors.target_date ? classes.inputError : ''}`}
                />
              </div>
              {errors.target_date && <span className={classes.errorMsg}>{errors.target_date.message}</span>}
            </div>
          </div>

          <div className={classes.inputGroup}>
            <label className={classes.label}>Why does this matter? (Internal Motivation)</label>
            <div className={classes.inputWrapper}>
              <MessageSquare size={18} className={classes.fieldIcon} />
              <textarea
                {...register('motivation')}
                placeholder="I want to build highly scalable systems that handle millions of users..."
                className={classes.textarea}
              />
            </div>
          </div>

          <div className={classes.inputGroup}>
            <label className={classes.label}>Success Metric (How will you know?)</label>
            <div className={classes.inputWrapper}>
              <Award size={18} className={classes.fieldIcon} />
              <input
                {...register('success_metric')}
                placeholder="e.g. Deploy a fully serverless API with 100% test coverage"
                className={classes.input}
              />
            </div>
          </div>

          <div className={classes.inputGroup}>
            <label className={classes.label}>Negative Stakes (What if you fail?)</label>
            <div className={classes.inputWrapper}>
              <AlertCircle size={18} className={classes.fieldIcon} />
              <input
                {...register('consequence')}
                placeholder="e.g. I will lose momentum and delay my career shift by 6 months"
                className={classes.input}
              />
            </div>
          </div>

          <div className={classes.actions}>
            <button type="button" className={classes.cancelBtn} onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className={classes.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Creating...' : 'Launch Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
