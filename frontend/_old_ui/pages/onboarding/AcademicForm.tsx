import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight } from 'lucide-react';

interface AcademicFormProps {
  onComplete: () => void;
}

export const AcademicForm = ({ onComplete }: AcademicFormProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    college: '',
    course: '',
    year: '1',
    course_duration: '4',
    cgpa: '',
    self_rating: 'average',
    schedule_type: 'fixed',
    intern_company: '',
    intern_hours: '4'
  });

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setFormData(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      await client.post('/onboarding/academic-profile', {
        college_name: formData.college,
        course_name: formData.course,
        course_duration: parseInt(formData.course_duration, 10),
        current_year: parseInt(formData.year, 10),
        cgpa: parseFloat(formData.cgpa) || null,
        performance_self_rating: formData.self_rating || null,
        college_schedule_type: formData.schedule_type,
        // Intern fields — only sent if internship schedule selected
        internship_company: formData.schedule_type === 'rotating' ? formData.intern_company : null,
        internship_hours_per_day: formData.schedule_type === 'rotating' ? parseInt(formData.intern_hours, 10) : null
      });
      
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to save academic profile format'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>College / University</label>
          <input 
            type="text" 
            name="college" 
            required 
            value={formData.college} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            placeholder="e.g. MIT, Stanford"
          />
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Course / Major</label>
          <input 
            type="text" 
            name="course" 
            required 
            value={formData.course} 
            onChange={handleChange} 
            style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
            placeholder="e.g. Computer Science"
          />
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Year of Study</label>
            <select name="year" value={formData.year} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
              {[1, 2, 3, 4, 5, 6].map(y => <option key={y} value={y}>Year {y}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>CGPA (Optional)</label>
            <input 
              type="number" 
              step="0.1" 
              name="cgpa" 
              value={formData.cgpa} 
              onChange={handleChange} 
              style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }} 
              placeholder="e.g. 3.8"
            />
          </div>
        </div>

        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Schedule Type</label>
          <select name="schedule_type" value={formData.schedule_type} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-primary)', color: 'var(--text-primary)' }}>
            <option value="fixed">Full-time Student</option>
            <option value="rotating">Student + Internship</option>
            <option value="irregular">Irregular / Part-time</option>
          </select>
        </div>

        {formData.schedule_type === 'rotating' && (
          <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', padding: '1rem', background: 'var(--bg-primary)', borderRadius: 'var(--radius-md)' }}>
            <div style={{ flex: 2 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Company</label>
              <input type="text" name="intern_company" value={formData.intern_company} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} placeholder="e.g. Google" />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-secondary)' }}>Hours/Day</label>
              <input type="number" name="intern_hours" value={formData.intern_hours} onChange={handleChange} style={{ width: '100%', padding: '0.75rem', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-subtle)', background: 'var(--bg-surface)', color: 'var(--text-primary)' }} placeholder="e.g. 6" />
            </div>
          </div>
        )}

      </div>

      <div className={classes.formActions}>
        <button type="submit" className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </form>
  );
};
