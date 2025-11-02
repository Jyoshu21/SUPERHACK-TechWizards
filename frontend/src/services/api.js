import axios from 'axios';

const API_BASE_URL = 'http://localhost:8000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

export const fetchToolsData = async () => {
  const response = await api.get('/tools_data');
  return response.data;
};

export const fetchChangeOverview = async () => {
  const response = await api.get('/change_overview');
  return response.data;
};

export const fetchPendingApprovals = async () => {
  const response = await api.get('/pending_approvals');
  return response.data;
};

export const fetchRiskHistory = async () => {
  const response = await api.get('/risk_history');
  return response.data;
};

export const fetchAnalytics = async () => {
  const response = await api.get('/analytics');
  return response.data;
};

export const approveChange = async (changeId) => {
  const response = await api.post(`/approve_change/${changeId}`);
  return response.data;
};

export const rejectChange = async (changeId, data) => {
  const response = await api.post(`/reject_change/${changeId}`, data);
  return response.data;
};

export const assessRisk = async (data) => {
  const response = await api.post('/assess_risk', data);
  return response.data;
};

export const reassessBusinessImpact = async (data) => {
  const response = await api.post('/reassess_business_impact', data);
  return response.data;
};

export const suggestPostmortem = async (data) => {
  const response = await api.post('/suggest_postmortem', data);
  return response.data;
};

export const sendEmailNotification = async (data) => {
  const response = await api.post('/send_email_notification', data);
  return response.data;
};

export default api;
