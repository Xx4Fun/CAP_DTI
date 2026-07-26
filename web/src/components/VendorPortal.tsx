import React, { useState, useEffect } from 'react';
import api from '../services/api';

export const VendorPortal: React.FC = () => {
  const [notices, setNotices] = useState<any[]>([]);
  const [selectedNotice, setSelectedNotice] = useState<any | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState('');
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    fetchNotices();
  }, []);

  const fetchNotices = async () => {
    try {
      const response = await api.get('/notices');
      setNotices(response.data);
    } catch (err) {
      console.error('Failed to fetch notices');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = ['application/pdf', 'image/jpeg', 'image/png'];
      if (!validTypes.includes(selectedFile.type)) {
        setIsError(true);
        setMessage('Invalid file type. Only PDF, JPEG, and PNG are allowed.');
        setFile(null);
        return;
      }
      setFile(selectedFile);
      setMessage('');
    }
  };

  const handleUploadRebuttal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedNotice || !file) return;

    // Check expiration locally first
    const isExpired = new Date(selectedNotice.due_date_timestamp) < new Date();
    if (isExpired) {
      setIsError(true);
      setMessage('The configured response period has expired (403 Forbidden).');
      return;
    }

    setUploading(true);
    setMessage('');
    setIsError(false);

    const formData = new FormData();
    formData.append('rebuttal', file);

    try {
      await api.post(`/notices/${selectedNotice.id}/rebuttal`, formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      setMessage('Rebuttal evidence successfully uploaded!');
      fetchNotices();
      setSelectedNotice(null);
      setFile(null);
    } catch (err: any) {
      setIsError(true);
      if (err.response && err.response.status === 403) {
        setMessage('Action Forbidden (403): Rebuttal period has expired.');
      } else if (err.response && err.response.data && err.response.data.message) {
        setMessage(err.response.data.message);
      } else {
        setMessage('Failed to upload rebuttal. Connection failed.');
      }
    } finally {
      setUploading(false);
    }
  };

  const getRemainingHours = (dueTimestamp: string) => {
    const diffMs = new Date(dueTimestamp).getTime() - new Date().getTime();
    if (diffMs <= 0) return 'Expired';
    const hours = Math.floor(diffMs / 3600000);
    const mins = Math.floor((diffMs % 3600000) / 60000);
    return `${hours}h ${mins}m remaining`;
  };

  return (
    <div className="onboarding-grid">
      <div className="glass onboarding-card">
        <h2 className="section-title">Issued Legal Notices</h2>
        <p className="section-subtitle">Monitor official Letter of Inquiry (LOI) and Show Cause Orders (SCO).</p>

        <div className="queue-list">
          {notices.length === 0 ? (
            <div className="empty-queue">No active notices found for your store.</div>
          ) : (
            notices.map((notice) => {
              const isExpired = new Date(notice.due_date_timestamp) < new Date();
              return (
                <div 
                  key={notice.id} 
                  className={`queue-item ${selectedNotice?.id === notice.id ? 'active' : ''}`}
                  onClick={() => setSelectedNotice(notice)}
                >
                  <div className="queue-item-meta">
                    <span className={`status-badge ${notice.notice_type}`}>{notice.notice_type}</span>
                    <span className={`status-pill ${notice.status}`}>{notice.status}</span>
                  </div>
                  <div className="queue-item-details">
                    <span className="tip-date">
                      Due: {new Date(notice.due_date_timestamp).toLocaleString()}
                    </span>
                    <span className={`time-remaining ${isExpired ? 'expired' : 'active'}`}>
                      {getRemainingHours(notice.due_date_timestamp)}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className="glass map-container-card">
        {selectedNotice ? (
          <div className="notice-details-pane">
            <div className="map-header">
              <h3>Notice Details & Response</h3>
              <span className="map-badge">Token Validation Gateway</span>
            </div>

            <div className="notice-summary-box">
              <p><strong>Notice Reference:</strong> #{selectedNotice.id}</p>
              <p><strong>Type:</strong> {selectedNotice.notice_type === 'LOI' ? 'Letter of Inquiry (Standard)' : 'Show Cause Order (Escalated)'}</p>
              <p><strong>Status:</strong> <span className={`status-pill ${selectedNotice.status}`}>{selectedNotice.status}</span></p>
              <p><strong>Expiry Lockout:</strong> {new Date(selectedNotice.due_date_timestamp).toLocaleString()}</p>
              
              <a 
                href={`${(import.meta.env.VITE_API_BASE_URL || 'https://cap-dti.onrender.com/api').replace(/\/api\/?$/, '')}/storage/${selectedNotice.pdf_file_path}`} 
                target="_blank" 
                rel="noreferrer"
                className="btn-secondary view-pdf-link"
                style={{ display: 'inline-block', marginTop: '10px', textDecoration: 'none', textAlign: 'center' }}
              >
                📄 Open Official Notice PDF
              </a>
            </div>

            {message && (
              <div className={isError ? 'error-badge' : 'success-badge'} style={{ marginTop: '15px' }}>
                {message}
              </div>
            )}

            {selectedNotice.status !== 'rebutted' && selectedNotice.status !== 'escalated' && (
              <form onSubmit={handleUploadRebuttal} className="rebuttal-upload-form" style={{ marginTop: '20px' }}>
                <div className="input-group">
                  <label>Upload Rebuttal Evidence</label>
                  <p className="input-desc" style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginBottom: '8px' }}>
                    Only PDF, JPEG, and PNG files accepted. Rebuttals strictly rejected after the 48-hour timestamp.
                  </p>
                  <input 
                    type="file" 
                    onChange={handleFileChange} 
                    accept=".pdf,.jpg,.jpeg,.png"
                    required
                    disabled={new Date(selectedNotice.due_date_timestamp) < new Date()}
                  />
                </div>

                <button 
                  type="submit" 
                  className="btn-primary" 
                  style={{ width: '100%', marginTop: '15px' }}
                  disabled={uploading || (new Date(selectedNotice.due_date_timestamp) < new Date())}
                >
                  {uploading ? 'Uploading Evidence...' : 'Submit Rebuttal Evidence'}
                </button>
              </form>
            )}
          </div>
        ) : (
          <div className="no-notice-selected">
            <p>Select a notice from the left pane to view details and upload rebuttal evidence.</p>
          </div>
        )}
      </div>
    </div>
  );
};
