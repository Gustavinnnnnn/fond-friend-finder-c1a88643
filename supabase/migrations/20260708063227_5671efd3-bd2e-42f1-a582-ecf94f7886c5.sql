
CREATE POLICY "Media publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'media');

CREATE POLICY "Media writable by admins"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Media updatable by admins"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Media deletable by admins"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'media' AND public.has_role(auth.uid(), 'admin'));
