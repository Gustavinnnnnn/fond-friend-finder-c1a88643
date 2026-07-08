
-- Trigger helper for updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- =========================================
-- settings (singleton)
-- =========================================
CREATE TABLE public.settings (
  id int PRIMARY KEY DEFAULT 1,
  model_name text NOT NULL DEFAULT 'Modelo',
  model_photo_url text,
  video_url text,
  free_duration_seconds int NOT NULL DEFAULT 13,
  price_cents int NOT NULL DEFAULT 3000,
  offer_title text NOT NULL DEFAULT 'Continue a chamada',
  offer_subtitle text NOT NULL DEFAULT 'Pague pra continuar de onde parou',
  contact_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT settings_singleton CHECK (id = 1)
);

GRANT SELECT ON public.settings TO anon, authenticated;
GRANT UPDATE ON public.settings TO authenticated;
GRANT ALL ON public.settings TO service_role;

ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Settings readable by everyone"
  ON public.settings FOR SELECT
  USING (true);

CREATE POLICY "Settings editable by authenticated"
  ON public.settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE TRIGGER settings_updated_at
  BEFORE UPDATE ON public.settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.settings (id) VALUES (1);

-- =========================================
-- call_sessions
-- =========================================
CREATE TABLE public.call_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'started',
  user_agent text,
  free_ended_at timestamptz,
  paid_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.call_sessions TO authenticated;
GRANT ALL ON public.call_sessions TO service_role;

ALTER TABLE public.call_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Sessions readable by authenticated"
  ON public.call_sessions FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER call_sessions_updated_at
  BEFORE UPDATE ON public.call_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================
-- payments
-- =========================================
CREATE TABLE public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid REFERENCES public.call_sessions(id) ON DELETE CASCADE,
  provider text NOT NULL DEFAULT 'mercadopago',
  provider_payment_id text,
  amount_cents int NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  qr_code text,
  qr_code_base64 text,
  ticket_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX payments_provider_payment_id_idx
  ON public.payments(provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;

CREATE INDEX payments_session_id_idx ON public.payments(session_id);

GRANT SELECT ON public.payments TO authenticated;
GRANT ALL ON public.payments TO service_role;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Payments readable by authenticated"
  ON public.payments FOR SELECT
  TO authenticated
  USING (true);

CREATE TRIGGER payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
