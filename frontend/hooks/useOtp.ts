import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import api from '@/lib/api';
import type { ApiResponse, RequestActionOtpPayload } from '@/types/api.types';

// Request a 6-digit verification code for a sensitive action — the backend mints
// it and emails it to the caller's own address. Shared by every OTP-gated
// confirm flow through the <OtpConfirm> component; the actual action endpoint
// (delete org / transfer / delete project) re-verifies the code on execution.
export function useRequestActionOtp() {
  return useMutation({
    mutationFn: async (vars: RequestActionOtpPayload) => {
      const res = await api.post<ApiResponse<unknown>>('/otp/request', vars);
      if (!res.data.success) throw new Error(res.data.error || 'Could not send the verification code');
    },
  });
}

/** Pull the backend's verbatim error message off an axios error (matches the
 *  teamError helper pattern), falling back when the shape isn't an API error. */
export function otpError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? (err.response?.data?.error ?? fallback) : fallback;
}
