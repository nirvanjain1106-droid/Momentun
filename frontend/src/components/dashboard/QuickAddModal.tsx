import { z } from 'zod';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useGoalStore } from '../../stores/goalStore';
import { useScheduleStore } from '../../stores/scheduleStore';

const taskSchema = z.object({
  title: z.string().min(1, 'Title is required').max(100, 'Title is too long'),
  duration_mins: z.number().int().min(5, 'Minimum 5 minutes').max(240, 'Maximum 4 hours'),
  energy_required: z.enum(['low', 'medium', 'high']),
  is_mvp_task: z.boolean(),
  goal_id: z.string().nullable().optional(),
});

type TaskFormData = z.infer<typeof taskSchema>;

interface QuickAddModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function QuickAddModal({ isOpen, onClose }: QuickAddModalProps) {
  const { register, handleSubmit, formState: { errors, isSubmitting }, reset } = useForm<TaskFormData>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      duration_mins: 30,
      energy_required: 'medium',
      is_mvp_task: false,
    }
  });
  
  const { goals } = useGoalStore();
  const { createAdHocTask } = useScheduleStore();

  if (!isOpen) return null;

  const onSubmit = async (data: TaskFormData) => {
    try {
      await createAdHocTask({
        ...data,
        goal_id: data.goal_id || null,
      });
      
      reset();
      onClose();
    } catch (err) {
      console.error('Failed to add ad-hoc task:', err);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-md overflow-hidden flex flex-col">
        <header className="p-4 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
          <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">Quick Add Task</h2>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300">
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </header>

        <form onSubmit={handleSubmit(onSubmit)} className="p-4 flex flex-col gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Title</label>
            <input 
              {...register('title')} 
              className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-transparent focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-gray-100 placeholder-gray-400"
              placeholder="E.g., Review architectural PRs"
            />
            {errors.title && <p className="text-red-500 text-xs mt-1">{errors.title.message}</p>}
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Duration (m)</label>
              <input 
                type="number"
                {...register('duration_mins', { valueAsNumber: true })} 
                className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-transparent focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-gray-100"
              />
              {errors.duration_mins && <p className="text-red-500 text-xs mt-1">{errors.duration_mins.message}</p>}
            </div>

            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Energy</label>
              <select 
                {...register('energy_required')}
                className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-transparent focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-gray-100"
              >
                <option value="low">Low (Routine)</option>
                <option value="medium" selected>Medium (Standard)</option>
                <option value="high">High (Deep Work)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Link to Goal (Optional)
            </label>
            <select
              {...register('goal_id')}
              className="w-full border border-gray-300 dark:border-gray-600 rounded p-2 bg-transparent focus:ring-2 focus:ring-brand-500 text-gray-800 dark:text-gray-100"
            >
              <option value="">No goal (Ad-hoc)</option>
              {goals
                .filter((g) => g.status === 'active')
                .map((goal) => (
                  <option key={goal.id} value={goal.id}>
                    {goal.title}
                  </option>
                ))}
            </select>
          </div>

          <div className="flex items-center gap-2 mt-2">
            <input 
              type="checkbox" 
              id="mvp"
              {...register('is_mvp_task')}
              className="w-4 h-4 text-brand-600 focus:ring-brand-500 border-gray-300 rounded cursor-pointer"
            />
            <label htmlFor="mvp" className="text-sm font-medium text-gray-700 dark:text-gray-300 cursor-pointer select-none">
              Mark as MVP (Must-do today)
            </label>
          </div>

          <div className="mt-4 flex gap-3 justify-end">
            <button 
              type="button" 
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
            <button 
              type="submit" 
              disabled={isSubmitting}
              className="px-4 py-2 bg-brand-600 text-white rounded hover:bg-brand-700 disabled:opacity-50 transition-colors font-medium shadow-sm hover:shadow"
            >
              {isSubmitting ? 'Adding...' : 'Add Task'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
