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
      } catch (err) {
        this.error = 'Failed to load agent status';
        console.error('Agent list fetch error:', err);
      }

      // Connect to SSE for real-time updates
      this.connectSSE();
    },

    connectSSE() {
      const eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle agent status updates
          if (data.type === 'agents' || (data.data && data.data.agents)) {
            this.agents = data.data.agents || data.agents || [];
            this.loading = false;
          }

          // Handle load metrics updates (update CPU/memory for specific agent)
          if (data.data && data.data.load_metrics) {
            const metrics = data.data.load_metrics;
            const agentIndex = this.agents.findIndex(a => a.agentId === metrics.agentId);
            if (agentIndex !== -1) {
              this.agents[agentIndex].cpuPercent = metrics.cpuPercent;
              this.agents[agentIndex].memoryPercent = metrics.memoryPercent;
            }
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        this.loading = false;
        // Browser auto-reconnects by default
      };

      // Cleanup on component destroy
      this.$cleanup(() => eventSource.close());
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
