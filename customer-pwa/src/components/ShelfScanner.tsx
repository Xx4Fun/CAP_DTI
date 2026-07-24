import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { ArrowLeft, Camera, Check, RefreshCw, Search, X } from 'lucide-react';
import { apiClient, type Commodity, type ComparisonResultResponse, type Establishment, type ScanTagResponse } from '../api/client';
import { consumeHandoff, writeHandoff } from '../app/handoffs';
import type { AppRoute } from '../app/routing';
import { fallbackCommodities } from '../data/srpFallback';
import { fallbackEstablishments } from '../data/establishments';
import { CameraShell } from './CameraShell';
import { StorePicker } from './StorePicker';
import { PriceStrip } from './ui/PriceStrip';
import { StatusBanner } from './ui/StatusBanner';

type ScannerState = 'store' | 'camera' | 'review' | 'analyzing' | 'product' | 'price' | 'comparing' | 'result';
type FacingMode = 'environment' | 'user';
type ShelfScannerProps = { onNavigate: (route: AppRoute) => void; isOnline: boolean };
const stopStream = (stream: MediaStream | null) => stream?.getTracks().forEach((track) => track.stop());

export function ShelfScanner({ onNavigate, isOnline }: ShelfScannerProps) {
  const [state, setState] = useState<ScannerState>('store');
  const [stores, setStores] = useState<Establishment[]>(fallbackEstablishments);
  const [selectedStore, setSelectedStore] = useState<Establishment | null>(null);
  const [recentStoreId, setRecentStoreId] = useState<number | null>(() => { const value = sessionStorage.getItem('price-watch-recent-store'); return value ? Number(value) : null; });
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<Commodity[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<Commodity | null>(null);
  const [productQuery, setProductQuery] = useState('');
  const [displayedPrice, setDisplayedPrice] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ComparisonResultResponse | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const updateStream = (next: MediaStream | null) => { streamRef.current = next; setStream(next); };

  useEffect(() => {
    let active = true;
    apiClient.get('/public/establishments').then((response) => {
      if (active && response.data?.success && Array.isArray(response.data.data)) setStores(response.data.data);
    }).catch(() => undefined);
    const handoff = consumeHandoff();
    if (handoff?.kind === 'price-to-scan') setSelectedProduct(fallbackCommodities.find((item) => item.id === handoff.commodityId) ?? null);
    return () => { active = false; stopStream(streamRef.current); };
  }, []);
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl); }, [previewUrl]);

  const openCamera = async (mode = facingMode) => {
    stopStream(streamRef.current); updateStream(null); setCameraError(null); setTorchSupported(false); setTorchOn(false); setState('camera');
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error('Camera capture is not supported by this browser.');
      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: mode } }, audio: false });
      updateStream(mediaStream);
      const capabilities = mediaStream.getVideoTracks()[0]?.getCapabilities() as MediaTrackCapabilities & { torch?: boolean };
      setTorchSupported(Boolean(capabilities?.torch));
    } catch (reason) {
      const blocked = reason instanceof DOMException && reason.name === 'NotAllowedError';
      setCameraError(blocked ? 'Camera access is blocked. Allow camera access in your browser, then try again.' : reason instanceof Error ? reason.message : 'We could not start the camera. Check your browser settings and try again.');
    }
  };
  const closeCamera = () => { stopStream(streamRef.current); updateStream(null); setState('store'); };
  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0]; if (!track || !torchSupported) return;
    const next = !torchOn; await track.applyConstraints({ advanced: [{ torch: next } as MediaTrackConstraintSet] }); setTorchOn(next);
  };
  const switchCamera = () => { const next = facingMode === 'environment' ? 'user' : 'environment'; setFacingMode(next); void openCamera(next); };
  const capture = () => {
    const video = videoRef.current;
    if (!video || video.readyState < 2 || video.videoWidth === 0) { setCameraError('The camera is not ready. Hold the device steady and try again.'); return; }
    const canvas = document.createElement('canvas'); canvas.width = video.videoWidth; canvas.height = video.videoHeight; canvas.getContext('2d')?.drawImage(video, 0, 0);
    canvas.toBlob((blob) => {
      if (!blob) { setCameraError('We could not capture this image. Try the camera again.'); return; }
      stopStream(streamRef.current); updateStream(null); if (previewUrl) URL.revokeObjectURL(previewUrl);
      setCapturedBlob(blob); setPreviewUrl(URL.createObjectURL(blob)); setState('review');
    }, 'image/jpeg', .9);
  };
  const analyze = async () => {
    if (!capturedBlob || !selectedStore) return;
    if (!isOnline) { setError('Shelf-tag analysis requires a live connection. Reconnect and retry.'); return; }
    setState('analyzing'); setError('');
    const form = new FormData(); form.append('image', capturedBlob, 'shelf-tag.jpg'); form.append('store_id', String(selectedStore.id));
    try {
      const response = await apiClient.post('/public/scan-tag', form, { headers: { 'Content-Type': 'multipart/form-data' } });
      if (!response.data?.success) throw new Error('The shelf tag could not be read.');
      const scan = response.data.data as ScanTagResponse; setCandidates(scan.candidates ?? []);
      if (scan.detected_price !== null) setDisplayedPrice(String(scan.detected_price));
      setState('product'); if ((scan.candidates ?? []).length === 0) setError('We could not match this shelf tag. Search for the product manually.');
    } catch (reason) {
      setCandidates([]); setState('product'); setError(reason instanceof Error ? reason.message : 'We could not read this shelf tag. Retake it or enter the product and price manually.');
    }
  };
  const productOptions = useMemo(() => {
    const pool = candidates.length > 0 ? candidates : fallbackCommodities; const needle = productQuery.trim().toLowerCase();
    return pool.filter((item) => !needle || item.commodity_name.toLowerCase().includes(needle)).slice(0, 30);
  }, [candidates, productQuery]);
  const compare = async (event: FormEvent) => {
    event.preventDefault(); const numericPrice = Number(displayedPrice);
    if (!selectedStore || !selectedProduct || !Number.isFinite(numericPrice) || numericPrice <= 0) { setError('Enter a valid displayed price before comparing.'); return; }
    setState('comparing'); setError('');
    try {
      const response = await apiClient.post('/public/compare-price', { store_id: selectedStore.id, commodity_id: selectedProduct.id, displayed_price: numericPrice });
      if (!response.data?.success) throw new Error('The comparison could not be completed.');
      setResult(response.data.data); setState('result');
    } catch (reason) { setState('price'); setError(reason instanceof Error ? reason.message : 'We could not compare this price. Nothing was recorded. Try again.'); }
  };

  if (state === 'camera') return <CameraShell title="Scan shelf tag" subtitle={selectedStore?.store_name ?? 'Selected store'} stream={stream} error={cameraError} canCapture={Boolean(stream)} torchSupported={torchSupported} torchOn={torchOn} onClose={closeCamera} onRetry={() => void openCamera()} onManualEntry={() => { closeCamera(); setState('product'); }} onToggleTorch={() => void toggleTorch()} onSwitchCamera={switchCamera} onCapture={capture} videoRef={videoRef} />;

  return (
    <section className="workflow-page scanner-page" aria-labelledby="scanner-title">
      <header className="page-header"><p className="page-kicker">Informational comparison</p><h1 id="scanner-title">Compare a shelf price</h1><p className="page-intro">Choose the store, capture its shelf tag, then confirm the exact product and displayed price.</p></header>
      {!isOnline && <StatusBanner variant="offline" title="Scanner requires a live connection">You can choose a store and product, but image analysis and comparison are unavailable offline.</StatusBanner>}
      {state === 'store' && <>
        {selectedProduct && <div className="starting-with"><span><small>Starting with product</small><strong>{selectedProduct.commodity_name}</strong></span><button type="button" aria-label="Remove starting product" onClick={() => setSelectedProduct(null)}><X aria-hidden="true" /></button></div>}
        <StorePicker stores={stores} selectedId={selectedStore?.id ?? null} recentStoreId={recentStoreId} onSelect={setSelectedStore} title="Where are you checking the price?" />
        <div className="sticky-actions"><button className="button button--primary" type="button" disabled={!selectedStore || !isOnline} onClick={() => { if (!selectedStore) return; sessionStorage.setItem('price-watch-recent-store', String(selectedStore.id)); setRecentStoreId(selectedStore.id); void openCamera(); }}><Camera aria-hidden="true" /> Open camera</button></div>
      </>}
      {state === 'review' && previewUrl && <section className="review-panel">
        <div className="workflow-heading"><button className="back-link" type="button" onClick={() => void openCamera()}><ArrowLeft aria-hidden="true" /> Retake</button><p>Step 2 of 4</p></div><h2>Use this shelf-tag photo?</h2>
        <img className="capture-preview" src={previewUrl} alt="Captured shelf tag" />
        {error && <StatusBanner variant="error" title="Could not continue">{error}</StatusBanner>}
        <div className="button-row"><button className="button button--secondary" type="button" onClick={() => void openCamera()}><RefreshCw aria-hidden="true" /> Retake</button><button className="button button--primary" type="button" onClick={() => void analyze()}>Analyze shelf tag</button></div>
      </section>}
      {state === 'analyzing' && <div className="processing-state" role="status"><RefreshCw aria-hidden="true" /><h2>Reading shelf tag</h2><p>Uploading securely and looking for product and price text…</p></div>}
      {state === 'product' && <section className="workflow-card">
        <div className="workflow-heading"><button className="back-link" type="button" onClick={() => setState('store')}><ArrowLeft aria-hidden="true" /> Change store</button><p>Step 3 of 4</p></div><h2>Confirm the product</h2><p>Choose the exact brand and package size. A suggested match is not a confirmed identification.</p>
        {error && <StatusBanner variant="warning" title="Manual selection needed">{error}</StatusBanner>}
        <div className="search-control"><label htmlFor="scanner-product-search">Search product</label><div><Search aria-hidden="true" /><input id="scanner-product-search" value={productQuery} onChange={(event) => setProductQuery(event.target.value)} /></div></div>
        <div className="candidate-list">{productOptions.map((item) => <button type="button" className={selectedProduct?.id === item.id ? 'is-selected' : ''} aria-pressed={selectedProduct?.id === item.id} key={item.id} onClick={() => setSelectedProduct(item)}><span><strong>{item.commodity_name}</strong><small>{item.unit || item.package_size} · Reference ₱{item.baseline_price.toFixed(2)}</small></span>{selectedProduct?.id === item.id && <Check aria-hidden="true" />}</button>)}</div>
        <div className="sticky-actions"><button className="button button--primary" type="button" disabled={!selectedProduct} onClick={() => setState('price')}>Continue with product</button></div>
      </section>}
      {(state === 'price' || state === 'comparing') && selectedProduct && <form className="workflow-card" onSubmit={compare}>
        <div className="workflow-heading"><button className="back-link" type="button" onClick={() => setState('product')}><ArrowLeft aria-hidden="true" /> Change product</button><p>Step 4 of 4</p></div><h2>Confirm the displayed shelf price</h2>
        <div className="selected-summary"><small>{selectedStore?.store_name}</small><strong>{selectedProduct.commodity_name}</strong><span>DTI reference: ₱{selectedProduct.baseline_price.toFixed(2)}</span></div>
        <label className="price-entry" htmlFor="displayed-price"><span>Displayed shelf price</span><div><strong>₱</strong><input id="displayed-price" inputMode="decimal" value={displayedPrice} onChange={(event) => setDisplayedPrice(event.target.value)} aria-describedby={error ? 'displayed-price-error' : undefined} /></div></label>
        {error && <StatusBanner variant="error" title="Comparison unavailable"><span id="displayed-price-error">{error}</span></StatusBanner>}
        <button className="button button--primary" type="submit" disabled={state === 'comparing'}>{state === 'comparing' ? 'Comparing…' : 'Compare prices'}</button>
      </form>}
      {state === 'result' && result && <section className="comparison-result">
        <p className="page-kicker">Comparison complete</p><h2>{result.comparison_label}</h2>
        <PriceStrip label="Shelf price" value={`₱${result.displayed_price.toFixed(2)}`} note={result.store.store_name} />
        <div className="comparison-rows"><div><span>DTI reference price</span><strong>₱{result.baseline_price.toFixed(2)}</strong></div><div><span>Difference</span><strong>{result.difference_pesos >= 0 ? '+' : '−'}₱{Math.abs(result.difference_pesos).toFixed(2)} ({Math.abs(result.percentage_srp - 100).toFixed(1)}%)</strong></div></div>
        <StatusBanner variant="info" title="This result is informational">{result.informational_notice || 'A shelf-price comparison does not automatically confirm a violation. DTI evaluates reports using the applicable bulletin and evidence.'}</StatusBanner>
        <div className="button-row"><button className="button button--secondary" type="button" onClick={() => { setResult(null); setState('store'); }}>Scan another</button><button className="button button--primary" type="button" onClick={() => { writeHandoff({ kind: 'scan-to-report', storeId: result.store.id, commodityId: result.product.id, displayedPrice: result.displayed_price, baselinePrice: result.baseline_price }); onNavigate({ name: 'new-report' }); }}>Report with receipt</button></div>
      </section>}
    </section>
  );
}
