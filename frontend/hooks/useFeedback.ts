import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import api from '@/lib/api';
import type { ApiResponse } from '@/types/api.types';

export function useSubmitFeedback() {
  return useMutation({
    mutationFn: async (vars: { title: string; body: string }) => {
      const res = await api.post<ApiResponse<unknown>>('/feedback', vars);
      if (!res.data.success) throw new Error(res.data.error || 'Could not send feedback');
    },
  });
}

export function feedbackError(err: unknown, fallback: string): string {
  return axios.isAxiosError(err) ? (err.response?.data?.error ?? fallback) : fallback;
}
