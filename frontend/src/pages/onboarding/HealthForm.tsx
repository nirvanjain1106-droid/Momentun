import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight } from 'lucide-react';

interface HealthFormProps {
  onComplete: () => void;
}

export const HealthForm = ({ onComplete }: HealthFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    sleep_quality: 'Good',
    sleep_hours: '7',
    fitness_level: 'Light',
    diet_type: 'Mixed'
  });

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSkip = () => {
    // Health is optional
    onComplete();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/health-profile', {
        sleep_quality: formData.sleep_quality,
        sleep_hours: parseInt(formData.sleep_hours, 10),
        fitness_level: formData.fitness_level,
        diet_type: formData.diet_type,
        limitations: null
      });
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to save health profile'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Typical Sleep Quality</label>
          <select name="sleep_quality" value={formData.sleep_quality} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="Excellent">Excellent</option>
            <option value="Good">Good</option>
            <option value="Fair">Fair</option>
            <option value="Poor">Poor</option>
          </select>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Average Sleep Hours ({formData.sleep_hours}h)</label>
          <input 
            type="range" 
            min="3" max="12" step="0.5" 
            name="sleep_hours" 
            value={formData.sleep_hours} 
            onChange={handleChange} 
            style={{ width: '100%' }}
          />
        </div>

        <div>
           <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Fitness Level</label>
           <select name="fitness_level" value={formData.fitness_level} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="Sedentary">Sedentary</option>
            <option value="Light">Light Activity</option>
            <option value="Active">Active</option>
            <option value="Athlete">Athlete</option>
           </select>
        </div>

      </div>

      <div className={classes.formActions}>
        <button type="button" onClick={handleSkip} className={classes.btnSkip} disabled={loading}>
          Skip
        </button>
        <button type="submit" className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </form>
  );
};
