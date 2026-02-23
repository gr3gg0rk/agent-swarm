export function taskProgress() {
  return {
    tasks: [],
    loading: true,
    error: null,

    async init() {
      try {
        // Fetch active tasks from REST API
        const response = await fetch('/api/tasks?status=in_progress');
        const data = await response.json();
        this.tasks = data.tasks || [];
        this.loading = false;
      } catch (err) {
        this.error = 'Failed to load task progress';
        this.loading = false;
        console.error('Task progress fetch error:', err);
      }

      // SSE connection will be added in 09-03 for real-time updates
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
