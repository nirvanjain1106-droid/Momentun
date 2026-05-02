import { useState } from 'react';
import { client } from '../../api/client';
import { getErrorMessage } from '../../lib/errorUtils';
import { useUIStore } from '../../stores/uiStore';
import classes from '../Onboarding.module.css';
import { Loader2, ArrowRight, Plus, Trash2 } from 'lucide-react';

interface FixedBlockEditorProps {
  onComplete: () => void;
}

interface Block {
  title: string;
  block_type: string;
  applies_to_days: number[];   // 1=Sun, 2=Mon, 3=Tue, 4=Wed, 5=Thu, 6=Fri, 7=Sat
  start_time: string;          // HH:MM
  end_time: string;            // HH:MM
  is_hard_constraint: boolean;
}

interface CurrentBlock {
  title: string;
  block_type: string;
  days: string[];              // day names — converted to ints on add
  start_time: string;
  end_time: string;
  is_hard_constraint: boolean;
}

// Day name → int: 1=Sun, 2=Mon … 7=Sat
const DAY_TO_INT: Record<string, number> = {
  Sunday: 1, Monday: 2, Tuesday: 3, Wednesday: 4,
  Thursday: 5, Friday: 6, Saturday: 7,
};

export const FixedBlockEditor = ({ onComplete }: FixedBlockEditorProps) => {
  const { addToast } = useUIStore();
  const [loading, setLoading] = useState(false);
  const [blocks, setBlocks] = useState<Block[]>([]);

  const [currentBlock, setCurrentBlock] = useState<CurrentBlock>({
    title: '',
    block_type: 'college',
    days: [],
    start_time: '09:00',
    end_time: '10:00',
    is_hard_constraint: true,
  });

  const daysList = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  const addBlock = () => {
    if (!currentBlock.title || currentBlock.days.length === 0) {
      addToast({ type: 'error', message: 'Title and at least one day are required.' });
      return;
    }
    if (currentBlock.start_time >= currentBlock.end_time) {
      addToast({ type: 'error', message: 'End time must be after start time' });
      return;
    }

    const newBlock: Block = {
      title: currentBlock.title,
      block_type: currentBlock.block_type,
      applies_to_days: currentBlock.days.map(d => DAY_TO_INT[d]),
      start_time: currentBlock.start_time,
      end_time: currentBlock.end_time,
      is_hard_constraint: currentBlock.is_hard_constraint,
    };

    setBlocks(prev => [...prev, newBlock]);
    setCurrentBlock({
      title: '',
      block_type: 'college',
      days: [],
      start_time: '09:00',
      end_time: '10:00',
      is_hard_constraint: true,
    });
  };

  const removeBlock = (index: number) => {
    setBlocks(prev => prev.filter((_, i) => i !== index));
  };

  const toggleDay = (day: string) => {
    setCurrentBlock(prev => {
      if (prev.days.includes(day)) {
        return { ...prev, days: prev.days.filter(d => d !== day) };
      }
      return { ...prev, days: [...prev.days, day] };
    });
  };

  const handleSkip = () => onComplete();

  const handleSubmit = async () => {
    if (blocks.length === 0) {
      // Allow skipping if no blocks added
      onComplete();
      return;
    }
    setLoading(true);

    try {
      await client.post('/onboarding/fixed-blocks', { blocks });
      onComplete();
    } catch (error: unknown) {
      addToast({
        type: 'error',
        message: getErrorMessage(error, 'Failed to save fixed blocks'),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <div style={{ marginBottom: '1.5rem', padding: '1rem', background: 'rgba(0,0,0,0.2)', borderRadius: 'var(--radius-md)' }}>
        <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>Add a Fixed Block</h4>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <input
              placeholder="Block Title (e.g. Physics 101)"
              value={currentBlock.title}
              onChange={e => setCurrentBlock(p => ({ ...p, title: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
            />
          </div>
          <div>
            <select
              value={currentBlock.block_type}
              onChange={e => setCurrentBlock(p => ({ ...p, block_type: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white', borderRadius: '4px' }}
            >
              <option value="college">College / Class</option>
              <option value="meal">Meal</option>
              <option value="sleep">Sleep</option>
              <option value="travel">Travel / Commute</option>
              <option value="commute">Commute</option>
              <option value="hygiene">Hygiene / Personal Care</option>
              <option value="prayer">Prayer / Meditation</option>
              <option value="family">Family Time</option>
              <option value="other">Other</option>
            </select>
          </div>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            {daysList.map(day => (
              <button
                key={day}
                type="button"
                onClick={() => toggleDay(day)}
                style={{
                  background: currentBlock.days.includes(day) ? 'var(--primary-500)' : 'transparent',
                  color: currentBlock.days.includes(day) ? '#fff' : 'var(--text-secondary)',
                  border: `1px solid ${currentBlock.days.includes(day) ? 'var(--primary-500)' : 'var(--border-subtle)'}`,
                  padding: '2px 8px', borderRadius: '12px', fontSize: '12px', cursor: 'pointer',
                }}
              >
                {day.substring(0, 3)}
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end' }}>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>From</label>
            <input type="time" value={currentBlock.start_time}
              onChange={e => setCurrentBlock(p => ({ ...p, start_time: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white' }} />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>To</label>
            <input type="time" value={currentBlock.end_time}
              onChange={e => setCurrentBlock(p => ({ ...p, end_time: e.target.value }))}
              style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', color: 'white' }} />
          </div>
          <button type="button" onClick={addBlock}
            style={{ background: 'var(--bg-hover)', color: 'white', padding: '0.5rem 1rem', borderRadius: '4px', border: '1px solid var(--border-subtle)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Plus size={16} /> Add
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', minHeight: '80px' }}>
        {blocks.length === 0 ? (
          <p style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px', margin: '1.5rem 0' }}>
            No blocks added yet. Add at least one, or skip.
          </p>
        ) : (
          blocks.map((b, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem', background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)', borderRadius: '4px' }}>
              <div>
                <strong style={{ color: 'white', display: 'block' }}>{b.title}</strong>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {b.applies_to_days.map(d => Object.keys(DAY_TO_INT).find(k => DAY_TO_INT[k] === d)?.substring(0, 3)).join(', ')}
                  {' • '}{b.start_time} - {b.end_time}
                </span>
              </div>
              <button type="button" onClick={() => removeBlock(idx)}
                style={{ background: 'transparent', border: 'none', color: 'var(--danger)', cursor: 'pointer' }}>
                <Trash2 size={16} />
              </button>
            </div>
          ))
        )}
      </div>

      <div className={classes.formActions}>
        <button type="button" onClick={handleSkip} className={classes.btnSkip} disabled={loading}>
          Skip
        </button>
        <button type="button" onClick={handleSubmit} className={classes.btnPrimary} disabled={loading}>
          {loading ? <Loader2 className={classes.spin} size={20} /> : 'Continue'}
          {!loading && <ArrowRight size={20} />}
        </button>
      </div>
    </div>
  );
};
