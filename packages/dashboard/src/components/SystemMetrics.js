import { Chart } from 'chart.js/auto';

export function systemMetrics() {
  return {
    metrics: {
      totalAgents: 0,
      onlineAgents: 0,
      activeTasks: 0,
      queueDepth: 0
    },
    chart: null,
    cpuData: [],
    memoryData: [],
    labels: [],

    async init() {
      try {
        // Fetch system metrics from status endpoint
        const [statusResp, tasksResp] = await Promise.all([
          fetch('/api/status'),
          fetch('/api/tasks?status=pending')
        ]);

        const statusData = await statusResp.json();
        const tasksData = await tasksResp.json();

        this.metrics.totalAgents = statusData.count || 0;
        this.metrics.onlineAgents = statusData.agents?.filter(a => a.status === 'online').length || 0;
        this.metrics.activeTasks = statusData.agents?.filter(a => a.status === 'busy').length || 0;
        this.metrics.queueDepth = tasksData.count || 0;

        // Initialize CPU/memory chart (populated via SSE in 09-03)
        this.initChart();

      } catch (err) {
        console.error('System metrics fetch error:', err);
      }
    },

    initChart() {
      const ctx = document.getElementById('metricsChart');
      if (!ctx) return;

      this.chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Average CPU %',
              data: [],
              borderColor: 'rgb(59, 130, 246)',
              tension: 0.4,
              fill: false
            },
            {
              label: 'Average Memory %',
              data: [],
              borderColor: 'rgb(16, 185, 129)',
              tension: 0.4,
              fill: false
            }
          ]
        },
        options: {
          responsive: true,
          animation: false, // Disable animation for real-time performance
          scales: {
            y: { min: 0, max: 100 }
          },
          plugins: {
            legend: {
              position: 'top'
            }
          }
        }
      });
    },

    updateChart(avgCpu, avgMemory) {
      if (!this.chart) return;

      const now = new Date().toLocaleTimeString();
      this.chart.data.labels.push(now);
      this.chart.data.datasets[0].data.push(avgCpu);
      this.chart.data.datasets[1].data.push(avgMemory);

      // Keep only last 30 data points (5 minutes at 10s intervals)
      if (this.chart.data.labels.length > 30) {
        this.chart.data.labels.shift();
        this.chart.data.datasets[0].data.shift();
        this.chart.data.datasets[1].data.shift();
      }

      this.chart.update('none'); // 'none' mode for better performance
    }
  };
}
