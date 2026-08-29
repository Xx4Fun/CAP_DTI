import { toast } from 'sonner'

export const ADMIN_TOASTER_ID = 'price-watch-admin'

type AdminToastOptions = {
  id: string
  duration?: number
}

const options = ({ id, duration = 4_000 }: AdminToastOptions) => ({
  id,
  duration,
  toasterId: ADMIN_TOASTER_ID,
})

export const adminToast = {
  success(message: string, toastOptions: AdminToastOptions) {
    return toast.success(message, options(toastOptions))
  },
  info(message: string, toastOptions: AdminToastOptions) {
    return toast.info(message, options(toastOptions))
  },
  error(message: string, toastOptions: AdminToastOptions) {
    return toast.error(message, options({ ...toastOptions, duration: toastOptions.duration ?? Infinity }))
  },
  session(message: string) {
    toast.dismiss('admin-auth-readiness')
    return toast.info(message, options({ id: 'admin-session-ended', duration: 7_000 }))
  },
  dismiss(id: string) {
    toast.dismiss(id)
  },
}
