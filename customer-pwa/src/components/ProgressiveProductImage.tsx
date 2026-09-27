import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Package } from 'lucide-react';

export interface ProgressiveProductImageProps {
  imageUrl: string | null | undefined;
  altText: string;
  variant: 'card' | 'detail';
  decorative: boolean;
  loading?: 'eager' | 'lazy';
  onSettled?: (status: ProductImageSettlement) => void;
}

type ImageStatus = 'loading' | 'loaded' | 'missing' | 'failed';
export type ProductImageSettlement = Exclude<ImageStatus, 'loading'>;

interface ImageState {
  url: string | null;
  status: ImageStatus;
}

const detailImageStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  objectFit: 'contain',
};

// A filled tile with a product glyph reads as a deliberate placeholder; the previous small icon
// plus a 0.56rem caption read as stray text in a 94px column. The label stays in the DOM for
// assistive technology instead of being shown at an unreadable size.
const ProductImageFallback: React.FC<{ variant: 'card' | 'detail' }> = ({ variant }) => (
  <span className="price-product-fallback price-product-fallback--neutral">
    <Package size={variant === 'detail' ? 44 : 28} aria-hidden="true" />
    <span className="visually-hidden">No image</span>
  </span>
);

export const ProgressiveProductImage: React.FC<ProgressiveProductImageProps> = ({
  imageUrl,
  altText,
  variant,
  decorative,
  loading = 'lazy',
  onSettled,
}) => {
  const currentUrl = imageUrl || null;
  const currentUrlRef = useRef(currentUrl);
  currentUrlRef.current = currentUrl;
  const [imageState, setImageState] = useState<ImageState>(() => ({
    url: currentUrl,
    status: currentUrl ? 'loading' : 'missing',
  }));
  const onSettledRef = useRef(onSettled);
  const reportedSettlementRef = useRef<string | null>(null);
  onSettledRef.current = onSettled;

  useLayoutEffect(() => {
    setImageState((existing) => (
      existing.url === currentUrl
        ? existing
        : { url: currentUrl, status: currentUrl ? 'loading' : 'missing' }
    ));
  }, [currentUrl]);

  const status = imageState.url === currentUrl
    ? imageState.status
    : (currentUrl ? 'loading' : 'missing');
  const unavailable = status === 'missing' || status === 'failed';
  const isLoaded = status === 'loaded';

  useEffect(() => {
    if (status === 'loading') return;
    const settlementKey = `${currentUrl || 'missing'}:${status}`;
    if (reportedSettlementRef.current === settlementKey) return;
    reportedSettlementRef.current = settlementKey;
    onSettledRef.current?.(status);
  }, [currentUrl, status]);

  const markLoaded = () => {
    if (currentUrl && currentUrlRef.current === currentUrl) {
      setImageState({ url: currentUrl, status: 'loaded' });
    }
  };

  const markFailed = () => {
    if (currentUrl && currentUrlRef.current === currentUrl) {
      setImageState({ url: currentUrl, status: 'failed' });
    }
  };

  return (
    <span
      className={`progressive-product-image progressive-product-image--${variant}${variant === 'card' ? ' price-product-media' : ''}`}
      aria-hidden={decorative ? 'true' : undefined}
    >
      {unavailable ? (
        <ProductImageFallback variant={variant} />
      ) : (
        <>
          <span
            className={`progressive-product-image__placeholder progressive-product-image__placeholder--${variant} ${isLoaded ? 'is-hidden' : 'is-visible'}`}
            aria-hidden="true"
          />
          <img
            key={currentUrl}
            className={`${variant === 'card' ? 'price-product-image ' : ''}progressive-product-image__image ${isLoaded ? 'is-loaded' : 'is-loading'}`}
            src={currentUrl || undefined}
            alt={decorative ? '' : altText}
            aria-hidden={decorative ? 'true' : undefined}
            loading={loading}
            decoding="async"
            style={variant === 'detail' ? detailImageStyle : undefined}
            onLoad={markLoaded}
            onError={markFailed}
          />
        </>
      )}
    </span>
  );
};
