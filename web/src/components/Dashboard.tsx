import React, { useState, useEffect } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
} from 'chart.js';
import api from '../services/api';

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ChartTitle,
  ChartTooltip,
  Legend
);

export const Dashboard: React.FC = () => {
  const [tips, setTips] = useState<any[]>([]);
  const [calamity, setCalamity] = useState(false);
  const [loadingCalamity, setLoadingCalamity] = useState(false);
  const [selectedTip, setSelectedTip] = useState<any | null>(null);
  
  // Mock inspection data for graph (4 weeks)
  const [chartData] = useState<any>({
    labels: ['Week 1', 'Week 2', 'Week 3', 'Week 4 (Current)'],
    datasets: [
      {
        label: 'Shelf Price (PHP)',
        data: [24.00, 26.50, 25.00, 29.00],
        borderColor: '#f59e0b',
        backgroundColor: 'rgba(245, 158, 11, 0.1)',
        tension: 0.3,
        fill: true,
      },
      {
        label: 'SRP Baseline (PHP)',
        data: [25.00, 25.00, 25.00, 25.00],
        borderColor: '#3b82f6',
        borderDash: [5, 5],
        pointRadius: 0,
        fill: false,
      }
    ]
  });

  useEffect(() => {
    fetchTips();
    fetchCalamityStatus();
  }, []);

  const fetchTips = async () => {
    try {
      const response = await api.get('/tips');
      setTips(response.data);
    } catch (err) {
      console.error('Failed to load tips');
    }
  };

  const fetchCalamityStatus = async () => {
    try {
      const response = await api.get('/calamity');
      setCalamity(response.data.state_of_calamity);
    } catch (err) {
      console.error('Failed to load calamity status');
    }
  };

  const handleCalamityToggle = async () => {
    setLoadingCalamity(true);
    try {
      const response = await api.post('/calamity/toggle', { state: !calamity });
      setCalamity(response.data.state_of_calamity);
      // Toggle class on body for theme matching
      if (response.data.state_of_calamity) {
        document.body.classList.add('calamity-mode');
      } else {
        document.body.classList.remove('calamity-mode');
      }
    } catch (err) {
      console.error('Failed to toggle calamity status');
    } finally {
      setLoadingCalamity(false);
    }
  };

  const handleTipAction = async (id: number, status: string) => {
    try {
      await api.post(`/tips/${id}/status`, { status });
      fetchTips();
      setSelectedTip(null);
    } catch (err) {
      console.error('Failed to update tip status');
    }
  };

  const chartOptions = {
    responsive: true,
    plugins: {
      legend: {
        labels: {
          color: '#f4f4f5',
          font: { family: 'Outfit' }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#a1a1aa', font: { family: 'Outfit' } }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.05)' },
        ticks: { color: '#a1a1aa', font: { family: 'Outfit' } }
      }
    }
  };

  return (
    <div className="dashboard-grid">
      {/* Volatility & Volatility Controls */}
      <div className="glass dashboard-chart-card">
        <div className="chart-header">
          <div>
            <h2 className="section-title">Temporal Volatility Analysis</h2>
            <p className="section-subtitle">4-Week commodity shelf fluctuations against flat SRP baseline.</p>
          </div>
          <div className="calamity-toggle-wrapper">
            <span className="calamity-label">State of Calamity</span>
            <label className="switch">
              <input 
                type="checkbox" 
                checked={calamity}
                onChange={handleCalamityToggle}
                disabled={loadingCalamity}
              />
              <span className="slider round"></span>
            </label>
          </div>
        </div>

        <div className="chart-container" style={{ margin: '20px 0', height: '300px' }}>
          <Line data={chartData} options={chartOptions} />
        </div>

        <div className="volatility-stats">
          <div className="stat-pill">
            <span className="stat-label">Max Deviation</span>
            <span className="stat-value alert-text">+16.0% (Week 4)</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Volatility Index</span>
            <span className="stat-value">0.14 (Moderate)</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">Emergency Protocol</span>
            <span className={calamity ? 'stat-value alert-text' : 'stat-value'}>
              {calamity ? 'ACTIVE (Strict 0% allowance)' : 'INACTIVE (10% threshold)'}
            </span>
          </div>
        </div>
      </div>

      {/* Manual Review Queue */}
      <div className="glass review-queue-card">
        <h2 className="section-title">Receipt Scanning Tip Queue</h2>
        <p className="section-subtitle">Citizen receipt OCR text captures awaiting manual review.</p>

        <div className="queue-list">
          {tips.length === 0 ? (
            <div className="empty-queue">All tips reviewed. Queue clear!</div>
          ) : (
            tips.map((tip) => (
              <div 
                key={tip.id} 
                className={`queue-item ${selectedTip?.id === tip.id ? 'active' : ''}`}
                onClick={() => setSelectedTip(tip)}
              >
                <div className="queue-item-meta">
                  <span className="store-tag">{tip.store?.store_name || 'Unmapped Vendor'}</span>
                  <span className={`status-pill ${tip.status}`}>{tip.status}</span>
                </div>
                <div className="queue-item-details">
                  <span className="tip-date">{new Date(tip.created_at).toLocaleDateString()}</span>
                  <span className="tip-alias">Receipt Scan #{tip.id}</span>
                </div>
              </div>
            ))
          )}
        </div>

        {selectedTip && (
          <div className="tip-detail-modal glass">
            <h4>Extracted OCR JSON Payload</h4>
            <pre className="ocr-json-display">
              {JSON.stringify(selectedTip.extracted_text_json, null, 2)}
            </pre>
            <div className="modal-actions">
              <button 
                onClick={() => handleTipAction(selectedTip.id, 'validated')} 
                className="btn-primary"
              >
                Validate & Flag Anomaly
              </button>
              <button 
                onClick={() => handleTipAction(selectedTip.id, 'dismissed')} 
                className="btn-secondary"
              >
                Dismiss Notice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
