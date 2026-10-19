import apiClient from './client';

/** Почта пользователя после действия админа. */
export interface AdminUserEmailState {
  user_id: number;
  email: string | null;
  email_verified: boolean;
  /** Ушла ли ссылка подтверждения; null — письмо не отправлялось (почту удалили). */
  email_sent: boolean | null;
}

export type EmailLogStatus = 'sent' | 'queued' | 'failed';

/** Строка журнала писем. Текста письма нет намеренно: в нём коды и ссылки входа. */
export interface EmailLogItem {
  id: number;
  to_email: string;
  email_type: string;
  subject: string;
  status: EmailLogStatus | string;
  error: string | null;
  created_at: string;
}

export interface EmailLogResponse {
  items: EmailLogItem[];
  total: number;
  retention_days: number;
}

export const adminUserEmailApi = {
  /** Указать почту: сохраняется неподтверждённой, на адрес уходит ссылка подтверждения. */
  setEmail: async (userId: number, email: string): Promise<AdminUserEmailState> => {
    const response = await apiClient.put(`/cabinet/admin/users/${userId}/email`, { email });
    return response.data;
  },

  /** Отправить ссылку ещё раз; прежняя ссылка перестаёт работать. */
  resendConfirmation: async (userId: number): Promise<AdminUserEmailState> => {
    const response = await apiClient.post(`/cabinet/admin/users/${userId}/email/resend`);
    return response.data;
  },

  deleteEmail: async (userId: number): Promise<AdminUserEmailState> => {
    const response = await apiClient.delete(`/cabinet/admin/users/${userId}/email`);
    return response.data;
  },

  getEmailLog: async (userId: number, limit = 50, offset = 0): Promise<EmailLogResponse> => {
    const response = await apiClient.get(`/cabinet/admin/users/${userId}/emails`, {
      params: { limit, offset },
    });
    return response.data;
  },
};
