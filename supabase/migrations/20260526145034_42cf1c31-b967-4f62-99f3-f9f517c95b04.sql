
-- Profiles
CREATE TABLE public.profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Profiles readable by authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own profile" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "Users update own profile" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- Sessions
CREATE TABLE public.sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sessions TO authenticated;
GRANT ALL ON public.sessions TO service_role;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Participants
CREATE TABLE public.participants (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(session_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.participants TO authenticated;
GRANT ALL ON public.participants TO service_role;
ALTER TABLE public.participants ENABLE ROW LEVEL SECURITY;

-- helper: is user a participant
CREATE OR REPLACE FUNCTION public.is_session_participant(_session_id UUID, _user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.participants WHERE session_id = _session_id AND user_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.sessions WHERE id = _session_id AND owner_id = _user_id
  );
$$;

CREATE POLICY "Sessions visible to participants" ON public.sessions FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_session_participant(id, auth.uid()));
CREATE POLICY "Users create sessions" ON public.sessions FOR INSERT TO authenticated WITH CHECK (owner_id = auth.uid());
CREATE POLICY "Owners update sessions" ON public.sessions FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "Owners delete sessions" ON public.sessions FOR DELETE TO authenticated USING (owner_id = auth.uid());

CREATE POLICY "Participants visible to session members" ON public.participants FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Users join sessions as self" ON public.participants FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "Users leave own participation" ON public.participants FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Documents
CREATE TABLE public.documents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT 'javascript',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Documents visible to participants" ON public.documents FOR SELECT TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants create documents" ON public.documents FOR INSERT TO authenticated
  WITH CHECK (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants update documents" ON public.documents FOR UPDATE TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));
CREATE POLICY "Participants delete documents" ON public.documents FOR DELETE TO authenticated
  USING (public.is_session_participant(session_id, auth.uid()));

-- Versions
CREATE TABLE public.versions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_number INT NOT NULL,
  content TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.versions TO authenticated;
GRANT ALL ON public.versions TO service_role;
ALTER TABLE public.versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Versions visible to participants" ON public.versions FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_session_participant(d.session_id, auth.uid())));
CREATE POLICY "Participants insert versions" ON public.versions FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_session_participant(d.session_id, auth.uid())));

-- Conflicts
CREATE TABLE public.conflicts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  user_a UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  user_b UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  line_number INT NOT NULL,
  resolution TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.conflicts TO authenticated;
GRANT ALL ON public.conflicts TO service_role;
ALTER TABLE public.conflicts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Conflicts visible to participants" ON public.conflicts FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_session_participant(d.session_id, auth.uid())));
CREATE POLICY "Participants insert conflicts" ON public.conflicts FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_session_participant(d.session_id, auth.uid())));
CREATE POLICY "Participants update conflicts" ON public.conflicts FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public.documents d WHERE d.id = document_id AND public.is_session_participant(d.session_id, auth.uid())));

-- Activity logs
CREATE TABLE public.activity_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
  activity TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_logs TO authenticated;
GRANT ALL ON public.activity_logs TO service_role;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own logs or session logs" ON public.activity_logs FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (session_id IS NOT NULL AND public.is_session_participant(session_id, auth.uid())));
CREATE POLICY "Users insert own logs" ON public.activity_logs FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Auto-create profile trigger
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'username', split_part(NEW.email,'@',1)));
  RETURN NEW;
END;
$$;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Realtime
ALTER TABLE public.documents REPLICA IDENTITY FULL;
ALTER TABLE public.participants REPLICA IDENTITY FULL;
ALTER TABLE public.conflicts REPLICA IDENTITY FULL;
ALTER TABLE public.activity_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.documents;
ALTER PUBLICATION supabase_realtime ADD TABLE public.participants;
ALTER PUBLICATION supabase_realtime ADD TABLE public.conflicts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.activity_logs;
