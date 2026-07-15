export interface ApiErrorDetail {
  field: string | null;
  message: string;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  statusCode: number;
  message: string;
  data: T | null;
  errors: ApiErrorDetail[];
  timestamp: string;
  path: string;
}
