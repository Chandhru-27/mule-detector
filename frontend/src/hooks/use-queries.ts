import { useQuery } from '@tanstack/react-query';
import { apiClient } from '@/lib/api-client';

export function useRingsQuery() {
  return useQuery({
    queryKey: ['rings'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/rings');
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function useJurisdictionRiskQuery(batchId: string = 'latest') {
  return useQuery({
    queryKey: ['jurisdictionRisk', batchId],
    queryFn: async () => {
      // The backend serves this at /results/<batch_id> directly on the 5000 port.
      // But let's check if the apiClient base URL maps correctly.
      // The apiClient base matches import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000'.
      const res = await apiClient.get(`/results/${batchId}`);
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function useAccountSearchQuery(panHash: string) {
  return useQuery({
    queryKey: ['accountSearch', panHash],
    queryFn: async () => {
      if (!panHash) return null;
      const res = await apiClient.get(`/api/v1/accounts/search?panHash=${panHash}`);
      return res.data;
    },
    enabled: !!panHash,
  });
}

export function useGraphInvestigationQuery(ringId: string) {
  return useQuery({
    queryKey: ['graphInvestigation', ringId],
    queryFn: async () => {
      if (!ringId) return null;
      const res = await apiClient.get(`/api/v1/graph-investigation/${ringId}`);
      return res.data;
    },
    enabled: !!ringId,
  });
}

export function useRiskScoresQuery() {
  return useQuery({
    queryKey: ['riskScores'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/risk-scores/global');
      return res.data;
    },
  });
}

export function usePaymentRailsQuery() {
  return useQuery({
    queryKey: ['paymentRails'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/payment-rails/metrics');
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function useReportsMetricsQuery() {
  return useQuery({
    queryKey: ['reportsMetrics'],
    queryFn: async () => {
      const res = await apiClient.get('/api/v1/reports/metrics');
      return res.data;
    },
    refetchInterval: 5000,
  });
}

export function useCaseNotesQuery(alertId: string | null) {
  return useQuery({
    queryKey: ['caseNotes', alertId],
    queryFn: async () => {
      if (!alertId) return [];
      const res = await apiClient.get(`/api/v1/alerts/${alertId}/notes`);
      return res.data;
    },
    enabled: !!alertId,
    refetchInterval: 5000,
  });
}

export function alertAction(alertId: string, action: string) {
  return apiClient.post(`/api/v1/alerts/${alertId}/actions/${action}`);
}
