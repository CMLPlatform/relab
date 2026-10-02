import { Component, type ReactNode, Suspense, useCallback } from 'react';
import { useAppFeedback } from '@/hooks/useAppFeedback';
import { ChunkLoadError } from './lazyWithRetry';

const CHUNK_LOAD_FAILED_MESSAGE = "Couldn't load this. Check your connection and try again.";

type BoundaryProps = {
  children: ReactNode;
  /** A failed boundary tries again when this turns true (the overlay is reopened). */
  open: boolean;
  onError: () => void;
};

class ChunkErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error) {
    if (error instanceof ChunkLoadError) error.retry();
    this.props.onError();
  }

  componentDidUpdate(prev: BoundaryProps) {
    if (this.state.failed && this.props.open && !prev.open) this.setState({ failed: false });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

/**
 * Suspense for an on-demand chunk, plus the error boundary it needs: a chunk that fails
 * to load renders nothing and raises a toast instead of blanking the whole app. Pair it
 * with lazyWithRetry so reopening fetches the chunk again.
 */
export function LazyBoundary({
  children,
  open = true,
  onError,
}: {
  children: ReactNode;
  /** Pass the overlay's open state when it stays mounted across closes. */
  open?: boolean;
  /** Close whatever asked for the chunk, so the next open retries. */
  onError?: () => void;
}) {
  const feedback = useAppFeedback();
  const handleError = useCallback(() => {
    feedback.toast(CHUNK_LOAD_FAILED_MESSAGE);
    onError?.();
  }, [feedback, onError]);
  return (
    <ChunkErrorBoundary open={open} onError={handleError}>
      <Suspense fallback={null}>{children}</Suspense>
    </ChunkErrorBoundary>
  );
}
