import React, { useState, useRef, useEffect } from 'react';
import { Camera, RefreshCw, AlertTriangle, Info } from 'lucide-react';
import { apiClient, type Commodity, type Establishment } from '../api/client';

export const ShelfScanner: React.FC = () => {
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [stores, setStores] = useState<Establishment[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<string>('');
  const [extractedPrice, setExtractedPrice] = useState<number | null>(null);
  const [matchedCommodity, setMatchedCommodity] = useState<Commodity | null>(null);
  const [scanning, setScanning] = useState(false);
  const [cameraError, setCameraError] = useState('');

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    fetchStores();
    startCamera();
    return () => {
      stopCamera();
    };
  }, []);

  const fetchStores = async () => {
    try {
      const res = await apiClient.get('/public/establishments');
      if (res.data.success) {
        setStores(res.data.data);
        if (res.data.data.length > 0) {
          setSelectedStoreId(String(res.data.data[0].id));
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const startCamera = async () => {
    setCameraError('');
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false,
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (err) {
      setCameraError('Camera access unavailable. Ensure HTTPS or camera permissions are granted.');
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg');
      setCapturedImage(dataUrl);
      simulateScan();
    }
  };

  const simulateScan = async () => {
    setScanning(true);
    // Simulate lightweight client OCR scan on shelf tag
    setTimeout(async () => {
      const detected = 45.00;
      setExtractedPrice(detected);

      try {
        const res = await apiClient.get('/public/commodities');
        if (res.data.success && res.data.data.length > 0) {
          setMatchedCommodity(res.data.data[0]); // Matches Regular Milled Rice
        }
      } catch (err) {
        console.error(err);
      } finally {
        setScanning(false);
      }
    }, 1200);
  };

  const handleRetake = () => {
    setCapturedImage(null);
    setExtractedPrice(null);
    setMatchedCommodity(null);
    startCamera();
  };

  return (
    <div>
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: '4px' }}>
          Shelf Price Reference Scanner
        </h2>
        <p style={{ color: '#a1a1aa', fontSize: '0.85rem', marginBottom: '16px' }}>
          Scan a shelf price tag for instant informational comparison against official DTI SRP baselines.
        </p>

        {/* Warning Disclaimer */}
        <div style={{
          background: 'rgba(59, 130, 246, 0.12)',
          border: '1px solid rgba(59, 130, 246, 0.3)',
          color: '#60a5fa',
          padding: '12px',
          borderRadius: '10px',
          fontSize: '0.82rem',
          display: 'flex',
          gap: '10px',
          alignItems: 'flex-start'
        }}>
          <Info size={18} style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <strong>Informational Comparison Only:</strong> This shelf comparison is for consumer reference only. It does not automatically create a formal report or confirm a violation.
          </div>
        </div>
      </div>

      {/* Select Establishment */}
      <div className="glass-panel" style={{ marginBottom: '16px' }}>
        <label style={{ fontSize: '0.85rem', fontWeight: 600, color: '#a1a1aa', display: 'block', marginBottom: '6px' }}>
          Select Establishment to Check
        </label>
        <select
          className="input-field"
          value={selectedStoreId}
          onChange={(e) => setSelectedStoreId(e.target.value)}
        >
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.store_name} — {s.address}
            </option>
          ))}
        </select>
      </div>

      {/* Camera Live Stream / Preview */}
      <div className="glass-panel">
        {!capturedImage ? (
          <div>
            {cameraError ? (
              <div style={{ padding: '20px', textAlign: 'center', color: '#f87171', fontSize: '0.9rem' }}>
                {cameraError}
              </div>
            ) : (
              <div className="camera-container">
                <video ref={videoRef} autoPlay playsInline muted className="camera-video" />
                <div className="camera-overlay">
                  <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', color: '#fbbf24' }}>
                    Align shelf tag inside bounding box
                  </div>
                  <div style={{ textAlign: 'center', background: 'rgba(0,0,0,0.6)', padding: '6px', borderRadius: '6px', fontSize: '0.75rem', color: '#fff' }}>
                    Hold steady & check illumination
                  </div>
                </div>
              </div>
            )}

            <canvas ref={canvasRef} style={{ display: 'none' }} />

            <button
              className="btn-primary"
              style={{ marginTop: '16px' }}
              onClick={handleCapture}
              disabled={!!cameraError}
            >
              <Camera size={18} /> Capture Shelf Tag
            </button>
          </div>
        ) : (
          <div>
            <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', marginBottom: '16px' }}>
              <img src={capturedImage} alt="Captured Shelf Tag" style={{ width: '100%', display: 'block', borderRadius: '12px' }} />
            </div>

            {scanning ? (
              <div style={{ textAlign: 'center', padding: '20px', color: '#a1a1aa' }}>
                Reading shelf price tag text...
              </div>
            ) : extractedPrice && matchedCommodity ? (
              <div style={{ background: 'rgba(0,0,0,0.4)', padding: '16px', borderRadius: '12px', marginBottom: '16px', border: '1px solid var(--border-color)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="badge badge-blue">MATCHED PRODUCT</span>
                  <span style={{ fontSize: '0.75rem', color: '#a1a1aa' }}>Effective Date: {matchedCommodity.effective_date}</span>
                </div>

                <div style={{ fontWeight: 800, fontSize: '1.1rem', color: '#fff', marginBottom: '8px' }}>
                  {matchedCommodity.commodity_name}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '12px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>Official SRP Baseline</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: '#f59e0b' }}>
                      ₱{Number(matchedCommodity.baseline_price).toFixed(2)}
                    </div>
                  </div>

                  <div style={{ background: 'rgba(255,255,255,0.03)', padding: '10px', borderRadius: '8px' }}>
                    <div style={{ fontSize: '0.72rem', color: '#a1a1aa' }}>Scanned Tag Price</div>
                    <div style={{ fontSize: '1.2rem', fontWeight: 800, color: extractedPrice > matchedCommodity.baseline_price ? '#ef4444' : '#10b981' }}>
                      ₱{extractedPrice.toFixed(2)}
                    </div>
                  </div>
                </div>

                {extractedPrice > matchedCommodity.baseline_price && (
                  <div style={{ marginTop: '12px', fontSize: '0.82rem', color: '#f87171', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <AlertTriangle size={16} /> Price exceeds reference baseline (+₱{(extractedPrice - matchedCommodity.baseline_price).toFixed(2)}).
                  </div>
                )}
              </div>
            ) : null}

            <button className="btn-secondary" onClick={handleRetake}>
              <RefreshCw size={16} /> Retake Photo
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
