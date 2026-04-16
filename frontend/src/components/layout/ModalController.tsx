import React from 'react';
import { useUIStore } from '../../stores/uiStore';
import { NewGoalModal } from '../goals/NewGoalModal';
import { QuickAddModal } from '../dashboard/QuickAddModal';

export const ModalController: React.FC = () => {
  const { activeModal } = useUIStore();

  if (!activeModal) return null;

  switch (activeModal.name) {
    case 'new-goal':
      return <NewGoalModal />;
    case 'quick-add':
      return <QuickAddModal />;
    case 'edit-goal':
      // return <EditGoalModal data={activeModal.data} />;
      return null;
    case 'confirm-delete':
      // return <ConfirmDeleteModal {...activeModal.data} />;
      return null;
    default:
      return null;
  }
};
