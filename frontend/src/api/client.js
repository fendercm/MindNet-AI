import axios from 'axios'

const API_BASE = 'http://localhost:8000'

const http = axios.create({
  baseURL: API_BASE,
  timeout: 90_000,
})

export const api = {
  health: async () => (await http.get('/health')).data,
  getSettings: async () => (await http.get('/settings')).data,
  saveSettings: async (changes) => (await http.put('/settings', changes)).data,
  testSettings: async () => (await http.post('/settings/test')).data,
  getNodes: async () => (await http.get('/nodes/')).data,
  createNode: async (node) => (await http.post('/nodes/', node)).data,
  updateNode: async (id, fields) => (await http.put(`/nodes/${id}`, fields)).data,
  deleteNode: async (id) => (await http.delete(`/nodes/${id}`)).data,
  createEdge: async (edge) => (await http.post('/edges/', edge)).data,
  getGraph: async () => (await http.get('/graph/')).data,
  clearAll: async () => (await http.delete('/nodes/all/')).data,

  aiExtractSkills: async (text) => (await http.post('/ai/add-skills/', { text })).data,
  aiSuggestConnections: async () => (await http.post('/ai/suggest-connections/')).data,
  aiGenerateProject: async () => (await http.post('/ai/generate-project/')).data,
  aiRecommendations: async () => (await http.get('/ai/recommendations/')).data,
  aiChat: async (message) => (await http.post('/ai/chat/', { message })).data,
}
