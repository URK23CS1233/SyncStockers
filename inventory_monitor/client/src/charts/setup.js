import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler,
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Tooltip,
  Legend,
  Filler
);

export const GRID = 'rgba(148, 163, 184, 0.08)';
export const TICK = '#94a3b8';

export const tooltipOpts = {
  backgroundColor: 'rgba(2, 6, 23, 0.95)',
  borderColor: 'rgba(51, 65, 85, 0.9)',
  borderWidth: 1,
  titleColor: '#e2e8f0',
  bodyColor: '#cbd5e1',
  padding: 10,
  cornerRadius: 10,
  displayColors: true,
};

export const legendOpts = {
  labels: {
    color: '#94a3b8',
    usePointStyle: true,
    pointStyle: 'circle',
    boxWidth: 7,
    padding: 14,
    font: { size: 11 },
  },
};

export function axisDefaults(extra = {}) {
  return {
    grid: { color: GRID, drawTicks: false },
    border: { display: false },
    ticks: { color: TICK, font: { size: 11 }, padding: 6 },
    ...extra,
  };
}

export default ChartJS;
