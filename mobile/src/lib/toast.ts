import Toast from 'react-native-toast-message';

// Thin wrapper mirroring web's sonner usage (toast.success / .error / message).
export const toast = {
  success(message: string, description?: string) {
    Toast.show({ type: 'success', text1: message, text2: description });
  },
  error(message: string, description?: string) {
    Toast.show({ type: 'error', text1: message, text2: description });
  },
  info(message: string, description?: string) {
    Toast.show({ type: 'info', text1: message, text2: description });
  },
  message(message: string, description?: string) {
    Toast.show({ type: 'info', text1: message, text2: description });
  },
};
