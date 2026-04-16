import { useUIStore } from '../../stores/uiStore';
import { NewGoalModal } from '../goals/NewGoalModal';
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
      // return <EditGoalModal data={activeModal.data} />;
      return null;
    case 'confirm-delete':
      // return <ConfirmDeleteModal {...activeModal.data} />;
      return null;
    case 'parking-lot':
      return <ParkingLotSheet />;
    default:
      return null;
  }
};
