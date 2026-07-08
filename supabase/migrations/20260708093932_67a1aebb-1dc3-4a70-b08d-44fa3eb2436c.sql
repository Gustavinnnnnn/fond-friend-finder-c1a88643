ALTER TABLE public.settings
  ADD COLUMN IF NOT EXISTS dispatch_price_cents integer NOT NULL DEFAULT 1990;

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'call';

CREATE INDEX IF NOT EXISTS idx_payments_session_kind
  ON public.payments(session_id, kind);

-- Track when the dispatch payment was completed (separate from call payment)
ALTER TABLE public.call_sessions
  ADD COLUMN IF NOT EXISTS dispatch_paid_at timestamptz;