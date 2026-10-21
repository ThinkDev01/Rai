import axios from 'axios';

/**
 * Returns true if the error is an HTTP 404 (resource not found).
 * Works with axios errors from the API layer.
 */
export function isNotFoundError(error: unknown): boolean {
  return axios.isAxiosError(error) && error.response?.status === 404;
}
