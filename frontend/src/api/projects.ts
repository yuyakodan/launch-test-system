import { apiClient } from './client';
import type { Project, ProjectConfig, ListResponse } from '@/types';

export interface CreateProjectInput {
  name: string;
  description?: string;
  config_json?: ProjectConfig;
}

export interface UpdateProjectInput {
  name?: string;
  description?: string;
  status?: 'active' | 'archived';
  config_json?: ProjectConfig;
}

export const projectsApi = {
  list: async (params?: { status?: string; page?: number; limit?: number }): Promise<Project[]> => {
    const response = await apiClient.get<ListResponse<Project>>('/projects', params);
    return response.items;
  },

  get: (id: string) => apiClient.get<Project>(`/projects/${id}`),

  create: (data: CreateProjectInput) => apiClient.post<Project>('/projects', data),

  update: (id: string, data: UpdateProjectInput) =>
    apiClient.patch<Project>(`/projects/${id}`, data),
};
