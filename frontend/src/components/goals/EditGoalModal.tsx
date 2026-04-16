import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { X, Target, Calendar, MessageSquare, Award, AlertCircle } from 'lucide-react';
import { useGoalStore, type Goal } from '../../stores/goalStore';
import { useUIStore } from '../../stores/uiStore';
import classes from './NewGoalModal.module.css';

const editSchema = z.object({
  title: z.string().min(3, 'Goal title must be at least 3 characters'),
  type: z.enum(['exam', 'fitness', 'skill', 'project', 'habit', 'other']),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  description: z.string().optional(),
  motivation: z.string().optional(),
  consequence: z.string().optional(),
  success_metric: z.string().optional(),
});

type EditGoalFormData = z.infer<typeof editSchema>;

interface EditGoalModalProps {
  goal: Goal;
}

export const EditGoalModal: React.FC<EditGoalModalProps> = ({ goal }) => {
  const { updateGoal } = useGoalStore();
  const { closeModal, addToast } = useUIStore();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<EditGoalFormData>({
    resolver: zodResolver(editSchema),
    defaultValues: {
      title: goal.title,
      type: (goal.type as EditGoalFormData['type']) || 'project',
      target_date: goal.target_date,
      description: goal.description || '',
      motivation: goal.motivation || '',
      consequence: goal.consequence || '',
      success_metric: goal.success_metric || '',
    },
  });

  const onSubmit = async (data: EditGoalFormData) => {
    try {
      await updateGoal(goal.id, { ...data, description: data.description || '' });
      addToast({ type: 'success', message: 'Goal updated successfully!' });
      closeModal();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to update goal';
      addToast({ type: 'error', message });
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
              <h2 className={classes.title}>Edit Goal</h2>
              <p className={classes.subtitle}>Refine your target and stay on track.</p>
            </div>
          </div>
          <button className={classes.closeBtn} onClick={closeModal} aria-label="Close">
            <X size={20} />
          </button>
        </div>

        <form className={classes.form} onSubmit={handleSubmit(onSubmit)}>
          <div className={classes.inputGroup}>
            <label className={classes.label}>Goal Title</label>
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
              <select {...register('type')} className={classes.select}>
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
            <label className={classes.label}>Why does this matter?</label>
            <div className={classes.inputWrapper}>
              <MessageSquare size={18} className={classes.fieldIcon} />
              <textarea
                {...register('motivation')}
                placeholder="Your internal motivation..."
                className={classes.textarea}
              />
            </div>
          </div>

          <div className={classes.inputGroup}>
            <label className={classes.label}>Success Metric</label>
            <div className={classes.inputWrapper}>
              <Award size={18} className={classes.fieldIcon} />
              <input
                {...register('success_metric')}
                placeholder="How will you know you've succeeded?"
                className={classes.input}
              />
            </div>
          </div>

          <div className={classes.inputGroup}>
            <label className={classes.label}>Negative Stakes</label>
            <div className={classes.inputWrapper}>
              <AlertCircle size={18} className={classes.fieldIcon} />
              <input
                {...register('consequence')}
                placeholder="What happens if you don't follow through?"
                className={classes.input}
              />
            </div>
          </div>

          <div className={classes.actions}>
            <button type="button" className={classes.cancelBtn} onClick={closeModal}>
              Cancel
            </button>
            <button type="submit" className={classes.submitBtn} disabled={isSubmitting}>
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
