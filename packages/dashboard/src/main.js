import Alpine from 'alpinejs';
import 'chart.js/auto';

// Register Alpine components (placeholder - implemented in 09-02)
Alpine.data('agentList', () => ({
  agents: [],
  loading: true,

  init() {
    console.log('Agent list component initialized');
    // SSE connection will be added in 09-03
    this.loading = false;
  }
}));

Alpine.data('systemMetrics', () => ({
  chart: null,

  init() {
    console.log('System metrics component initialized');
    // Chart.js initialization will be added in 09-02
  }
}));

// Start Alpine
window.Alpine = Alpine;
Alpine.start();

console.log('Dashboard initialized');
