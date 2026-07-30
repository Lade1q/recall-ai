import apiClient from '@/lib/apiClient';
import { ENDPOINTS } from '@/lib/endpoints';

export interface CreatePlanResponse {
  planId: string;
}

interface BackendCreatePlanResponse {
  success: boolean;
  data: {
    plan: {
      id: string;
    };
    message: string;
  };
}

export const planApi = {
  createPlan: async (formData: FormData): Promise<CreatePlanResponse> => {
    const response = await apiClient.post<BackendCreatePlanResponse>(
      ENDPOINTS.PLANS.BASE,
      formData,
      {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      }
    );
    return {
      planId: response.data.data.plan.id,
    };
  },
};
