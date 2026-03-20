import axios from 'axios'

const API_BASE = 'http://localhost:8000'

export const api = {
  getNodes: async () => {
    const res = await axios.get(`${API_BASE}/nodes/`)
    return res.data
  },
  createNode: async (node) => {
    const res = await axios.post(`${API_BASE}/nodes/`, node)
    return res.data
  },
  createEdge: async (edge) => {
    const res = await axios.post(`${API_BASE}/edges/`, edge)
    return res.data
  },
  getGraph: async () => {
    const res = await axios.get(`${API_BASE}/graph/`)
    return res.data
  },
  generateProject: async () => {
    const res = await axios.post(`${API_BASE}/ai/generate-project/`)
    return res.data
  },
  getRecommendations: async () => {
    const res = await axios.get(`${API_BASE}/ai/recommendations/`)
    return res.data
  }
}