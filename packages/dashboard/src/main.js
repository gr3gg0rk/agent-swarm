import Alpine from 'alpinejs';
import 'chart.js/auto';
import { agentList } from './components/AgentList.js';
import { taskProgress } from './components/TaskProgress.js';
import { systemMetrics } from './components/SystemMetrics.js';

// Register Alpine components
Alpine.data('agentList', agentList);
Alpine.data('taskProgress', taskProgress);
Alpine.data('systemMetrics', systemMetrics);

// Start Alpine
window.Alpine = Alpine;
Alpine.start();

console.log('Dashboard initialized with components');
