export function taskProgress() {
  return {
    tasks: [],
    loading: true,
    error: null,

    async init() {
      try {
        // Fetch initial active tasks from REST API
        const response = await fetch('/api/tasks?status=in_progress');
        const data = await response.json();
        this.tasks = data.tasks || [];
      } catch (err) {
        this.error = 'Failed to load task progress';
        console.error('Task progress fetch error:', err);
      }

      // Connect to SSE for real-time updates
      this.connectSSE();
    },

    connectSSE() {
      const eventSource = new EventSource('/api/events');

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          // Handle task updates (will be sent when tasks change)
          // For now, refresh task list on any event
          if (data.type === 'agents' || data.type === 'connected') {
            this.refreshTasks();
          }
        } catch (err) {
          console.error('SSE parse error:', err);
        }
      };

      eventSource.onerror = (err) => {
        console.error('SSE connection error:', err);
        this.loading = false;
      };

      this.$cleanup(() => eventSource.close());
    },

    async refreshTasks() {
      try {
        const response = await fetch('/api/tasks?status=in_progress');
        const data = await response.json();
        this.tasks = data.tasks || [];
        this.loading = false;
      } catch (err) {
        console.error('Task refresh error:', err);
      }
    },

    // Get status badge color
    statusBadge(status) {
      const badges = {
        'pending': 'background: #e5e7eb; color: #374151',
        'in_progress': 'background: #dbeafe; color: #1e40af',
        'completed': 'background: #dcfce7; color: #166534',
        'failed': 'background: #fee2e2; color: #991b1b'
      };
      return badges[status] || 'background: #f3f4f6; color: #6b7280';
    },

    // Format timestamp
    formatTime(timestamp) {
      if (!timestamp) return 'N/A';
      return new Date(timestamp).toLocaleTimeString();
    },

    // Calculate progress percentage (based on time elapsed vs timeout)
    calculateProgress(task) {
      if (!task.created_at || !task.timeout_ms) return 0;
      const elapsed = Date.now() - task.created_at;
      const percent = Math.min(100, (elapsed / task.timeout_ms) * 100);
      return Math.round(percent);
    }
  };
}
