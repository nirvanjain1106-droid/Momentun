import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, CheckCircle } from 'lucide-react';

interface GoalSetupFormProps {
  onComplete: () => void;
}

export const GoalSetupForm = ({ onComplete }: GoalSetupFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: '',
    goal_type: 'exam',
    description: '',
    target_date: '',
    motivation: '',
    consequence: '',
    success_metric: '',
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/goal', {
        title: formData.title,
        goal_type: formData.goal_type,
        description: formData.description || null,
        target_date: formData.target_date,           // "YYYY-MM-DD" — backend validates this
        motivation: formData.motivation || null,
        consequence: formData.consequence || null,
        success_metric: formData.success_metric || null,
      });
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to establish your first goal.'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>What is your primary goal?</label>
          <input
            type="text"
            name="title"
            required
            value={formData.title}
            onChange={handleChange}
            placeholder="e.g. Pass Final Exams"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-active)', background: 'var(--bg-primary)', color: 'var(--text-primary)', fontSize: '1.2rem', fontWeight: 600 }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Goal Type</label>
          <select name="goal_type" value={formData.goal_type} onChange={handleChange}
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="exam">Exam / Academic</option>
            <option value="fitness">Fitness / Health</option>
            <option value="skill">Skill Development</option>
            <option value="project">Project / Work</option>
            <option value="habit">Habit Formation</option>
            <option value="other">Other</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Description / Focus area</label>
          <textarea
            name="description"
            rows={2}
            value={formData.description}
            onChange={handleChange}
            placeholder="e.g. Focus on organic chemistry and calculus"
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'none' }}
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Target Date</label>
          <input
            type="date"
            name="target_date"
            required
            value={formData.target_date}
            onChange={handleChange}
            min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}  // must be future
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Motivation</label>
            <textarea
              name="motivation"
              rows={2}
              value={formData.motivation}
              onChange={handleChange}
              placeholder="Why does this matter?"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'none' }}
            />
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Consequence</label>
            <textarea
              name="consequence"
              rows={2}
              value={formData.consequence}
              onChange={handleChange}
              placeholder="What if I fail?"
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)', resize: 'none' }}
            />
          </div>
        </div>

      </div>

      <div className={classes.formActions}>
        <button type="submit" className={classes.btnPrimary} disabled={loading} style={{ background: 'var(--success)' }}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Complete Setup'}
          {!loading && <CheckCircle size={20} />}
        </button>
      </div>
    </form>
  );
};
