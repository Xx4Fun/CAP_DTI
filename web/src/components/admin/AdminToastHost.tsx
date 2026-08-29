import { Toaster } from 'sonner'
import { ADMIN_TOASTER_ID } from '../../services/adminToast'

export function AdminToastHost() {
  return (
    <Toaster
      id={ADMIN_TOASTER_ID}
      position="top-center"
      closeButton
      richColors
      expand
      visibleToasts={3}
      gap={10}
      offset={20}
      mobileOffset={12}
      theme="light"
      containerAriaLabel="Admin notifications"
      toastOptions={{
        duration: 4_000,
        classNames: {
          toast: 'admin-toast',
          title: 'admin-toast-title',
          description: 'admin-toast-description',
          closeButton: 'admin-toast-close',
        },
      }}
    />
  )
}
