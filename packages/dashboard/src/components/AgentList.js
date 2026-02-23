export function agentList() {
  return {
    agents: [],
    loading: true,
    error: null,

    async init() {
      try {
        // Fetch initial agent status from REST API
        const response = await fetch('/api/status');
        const data = await response.json();
        this.agents = data.agents || [];
        this.loading = false;
      } catch (err) {
        this.error = 'Failed to load agent status';
        this.loading = false;
        console.error('Agent list fetch error:', err);
      }

      // SSE connection will be added in 09-03 for real-time updates
    },

    // Format timestamp to relative time
    timeAgo(timestamp) {
      if (!timestamp) return 'Never';
      const seconds = Math.floor((Date.now() - timestamp) / 1000);
      if (seconds < 60) return `${seconds}s ago`;
      const minutes = Math.floor(seconds / 60);
      if (minutes < 60) return `${minutes}m ago`;
      return `${Math.floor(minutes / 60)}h ago`;
    },

    // Get status color class
    statusColor(status) {
      const colors = {
        'online': 'color: #16a34a',
        'offline': 'color: #9ca3af',
        'busy': 'color: #ca8a04',
        'error': 'color: #dc2626'
      };
      return colors[status] || 'color: #6b7280';
    },

    // Format CPU/memory with % sign
    formatPercent(value) {
      return value !== undefined ? `${Math.round(value)}%` : 'N/A';
    }
  };
}
