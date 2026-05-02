import { useUIStore } from '../../stores/uiStore';
import { NewGoalModal } from '../goals/NewGoalModal';
import { EditGoalModal } from '../goals/EditGoalModal';
import { ConfirmDeleteModal } from '../ui/ConfirmDeleteModal';
import { ParkingLotSheet } from '../dashboard/ParkingLotSheet';
import { QuickAddModal } from '../dashboard/QuickAddModal';

export const ModalController: React.FC = () => {
  const { activeModal, closeModal } = useUIStore();

  if (!activeModal) return null;

  switch (activeModal.name) {
    case 'new-goal':
      return <NewGoalModal />;
    case 'quick-add':
      return <QuickAddModal isOpen={true} onClose={closeModal} />;
    case 'edit-goal':
      return <EditGoalModal goal={activeModal.data} />;
    case 'confirm-delete':
      return <ConfirmDeleteModal title={activeModal.data.title} onConfirm={activeModal.data.onConfirm} />;
    case 'parking-lot':
      return <ParkingLotSheet />;
    default:
      return null;
  }
};
