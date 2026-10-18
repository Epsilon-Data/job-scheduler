
-- Name: job_output_files_guard(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.job_output_files_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    IF (TG_OP <> 'INSERT' AND EXISTS (SELECT 1 FROM release_decisions d WHERE d.job_id = OLD.job_id))
       OR (TG_OP <> 'DELETE' AND EXISTS (SELECT 1 FROM release_decisions d WHERE d.job_id = NEW.job_id)) THEN
        RAISE EXCEPTION 'held output files of job % are fixed after a release decision',
              coalesce(NEW.job_id, OLD.job_id) USING ERRCODE = 'RG010';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

-- Name: job_outputs_files_manifest_guard(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.job_outputs_files_manifest_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF NEW.files_manifest_sha256 IS DISTINCT FROM OLD.files_manifest_sha256
       AND EXISTS (SELECT 1 FROM release_decisions d WHERE d.job_id = OLD.job_id) THEN
        RAISE EXCEPTION 'the file manifest of job % is fixed after a release decision', OLD.job_id
              USING ERRCODE = 'RG010';
    END IF;
    RETURN NEW;
END $$;

-- Name: job_outputs_guard(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.job_outputs_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    IF EXISTS (SELECT 1 FROM release_decisions d WHERE d.job_id = OLD.job_id) THEN
        RAISE EXCEPTION 'held output for job % is fixed after a release decision', OLD.job_id USING ERRCODE = 'RG011';
    END IF;
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END $$;

-- Name: job_requests_project_guard(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.job_requests_project_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF (OLD.project_id IS NOT NULL AND NEW.project_id IS DISTINCT FROM OLD.project_id)
       OR (OLD.archetype_id IS NOT NULL AND NEW.archetype_id IS DISTINCT FROM OLD.archetype_id) THEN
        RAISE EXCEPTION 'job %: the recorded project cannot change', OLD.job_id USING ERRCODE = 'RG025';
    END IF;
    RETURN NEW;
END $$;

-- Name: job_requests_release_guard(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.job_requests_release_guard() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NEW.release_status IN ('released', 'withheld') THEN
            RAISE EXCEPTION 'job %: cannot be created with release status %', NEW.job_id, NEW.release_status
                  USING ERRCODE = 'RG024';
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.release_status IS NOT DISTINCT FROM OLD.release_status THEN
        RETURN NEW;
    END IF;
    IF OLD.release_status IN ('released', 'withheld') THEN
        RAISE EXCEPTION 'job %: release status % is final', OLD.job_id, OLD.release_status USING ERRCODE = 'RG020';
    END IF;
    IF OLD.release_status = 'pending' AND NEW.release_status IS DISTINCT FROM 'released'
                                      AND NEW.release_status IS DISTINCT FROM 'withheld' THEN
        RAISE EXCEPTION 'job %: a pending release can only become released or withheld', OLD.job_id
              USING ERRCODE = 'RG023';
    END IF;
    IF NEW.release_status = 'released' AND NOT EXISTS (
            SELECT 1 FROM release_decisions d WHERE d.job_id = NEW.job_id AND d.decision = 'approve') THEN
        RAISE EXCEPTION 'job %: cannot be released without an approve decision', NEW.job_id USING ERRCODE = 'RG021';
    END IF;
    IF NEW.release_status = 'withheld' AND NOT EXISTS (
            SELECT 1 FROM release_decisions d WHERE d.job_id = NEW.job_id AND d.decision = 'reject') THEN
        RAISE EXCEPTION 'job %: cannot be withheld without a reject decision', NEW.job_id USING ERRCODE = 'RG022';
    END IF;
    RETURN NEW;
END $$;

-- Name: release_decisions_before_insert(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.release_decisions_before_insert() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
    v_job_user        uuid;
    v_ws_user         uuid;
    v_release_status  varchar;
    v_project         uuid;
    v_reviewer_role   varchar;
    v_reviewer_status varchar;
    v_synced_at       timestamptz;
    v_kind            varchar;
    v_content_sha     varchar;
    v_attested        varchar;
    v_files_manifest  varchar;
BEGIN
    SELECT jr.user_id, w.user_id, jr.release_status, jr.project_id
      INTO v_job_user, v_ws_user, v_release_status, v_project
      FROM job_requests jr
      JOIN workspaces w ON w.id = jr.workspace_id
     WHERE jr.job_id = NEW.job_id
       FOR UPDATE OF jr;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'release decision: job % not found', NEW.job_id USING ERRCODE = 'RG005';
    END IF;

    IF NEW.reviewer_id = v_job_user OR NEW.reviewer_id = v_ws_user THEN
        RAISE EXCEPTION 'release decision: a reviewer cannot decide on their own job' USING ERRCODE = 'RG001';
    END IF;

    SELECT role, approval_status INTO v_reviewer_role, v_reviewer_status FROM users WHERE id = NEW.reviewer_id;
    IF v_reviewer_role IS DISTINCT FROM 'reviewer' OR v_reviewer_status IS DISTINCT FROM 'approved' THEN
        RAISE EXCEPTION 'release decision: user % is not an approved reviewer', NEW.reviewer_id USING ERRCODE = 'RG002';
    END IF;

    IF v_release_status IS DISTINCT FROM 'pending' THEN
        RAISE EXCEPTION 'release decision: job % is not pending release (%)', NEW.job_id, coalesce(v_release_status, 'null')
              USING ERRCODE = 'RG003';
    END IF;

    IF v_project IS NULL THEN
        RAISE EXCEPTION 'release decision: job % has no project, so it cannot be routed to a reviewer', NEW.job_id
              USING ERRCODE = 'RG006';
    END IF;

    SELECT synced_at INTO v_synced_at
      FROM reviewer_projects
     WHERE user_id = NEW.reviewer_id AND project_id = v_project
       FOR SHARE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'release decision: user % is not a reviewer of project %', NEW.reviewer_id, v_project
              USING ERRCODE = 'RG007';
    END IF;
    IF v_synced_at < now() - interval '5 minutes' THEN
        RAISE EXCEPTION 'release decision: the reviewer assignment of user % was not confirmed in the last 5 minutes', NEW.reviewer_id
              USING ERRCODE = 'RG008';
    END IF;

    SELECT kind, content_sha256, attested_output_hash, files_manifest_sha256
      INTO v_kind, v_content_sha, v_attested, v_files_manifest
      FROM job_outputs WHERE job_id = NEW.job_id FOR SHARE;
    IF v_content_sha IS NULL OR v_content_sha <> NEW.output_sha256
       OR NEW.files_manifest_sha256 IS DISTINCT FROM v_files_manifest THEN
        RAISE EXCEPTION 'release decision: output hash does not match the held output' USING ERRCODE = 'RG004';
    END IF;

    IF NEW.decision = 'approve' AND v_kind = 'result'
       AND (v_attested IS NULL OR v_attested <> v_content_sha)
       AND coalesce(current_setting('epsilon.allow_unattested_release', true), 'off') <> 'on' THEN
        RAISE EXCEPTION 'release decision: the held result of job % does not match its attested output hash', NEW.job_id
              USING ERRCODE = 'RG009';
    END IF;

    NEW.project_id := v_project;
    RETURN NEW;
END $$;

-- Name: release_decisions_immutable(); Type: FUNCTION; Schema: public; Owner: -

CREATE FUNCTION public.release_decisions_immutable() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
    IF TG_OP = 'DELETE' AND pg_trigger_depth() > 1 THEN
        RETURN OLD;
    END IF;
    RAISE EXCEPTION 'release decisions are append-only' USING ERRCODE = 'RG010';
END $$;

-- Name: job_logs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.job_logs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id character varying(255) NOT NULL,
    worker_name character varying(100) NOT NULL,
    step_name character varying(255) NOT NULL,
    step_type character varying(50) NOT NULL,
    level character varying(20) DEFAULT 'info'::character varying NOT NULL,
    message text NOT NULL,
    log_metadata jsonb,
    progress integer,
    duration_ms integer,
    error_details jsonb,
    parent_log_id uuid,
    created_at timestamp without time zone DEFAULT now()
);

-- Name: job_output_files; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.job_output_files (
    job_id character varying(255) NOT NULL,
    name character varying(100) NOT NULL,
    size integer NOT NULL,
    content_type character varying(64) NOT NULL,
    sha256 character varying(64) NOT NULL,
    storage_key text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT job_output_files_name_check CHECK (((name)::text ~ '^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$'::text)),
    CONSTRAINT job_output_files_sha256_check CHECK (((sha256)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT job_output_files_size_check CHECK ((size >= 0))
);

-- Name: job_outputs; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.job_outputs (
    job_id character varying(255) NOT NULL,
    kind character varying(10) NOT NULL,
    content text NOT NULL,
    content_sha256 character varying(64) NOT NULL,
    attested_output_hash character varying(64),
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    files_manifest_sha256 character varying(64),
    CONSTRAINT job_outputs_files_manifest_sha256_check CHECK (((files_manifest_sha256 IS NULL) OR ((files_manifest_sha256)::text ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT job_outputs_attested_output_hash_check CHECK (((attested_output_hash IS NULL) OR ((attested_output_hash)::text ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT job_outputs_content_sha256_check CHECK (((content_sha256)::text = encode(sha256(convert_to(content, 'UTF8'::name)), 'hex'::text))),
    CONSTRAINT job_outputs_kind_check CHECK (((kind)::text = ANY ((ARRAY['result'::character varying, 'error'::character varying])::text[])))
);

-- Name: job_requests; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.job_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id character varying(255) NOT NULL,
    workspace_id uuid NOT NULL,
    user_id uuid NOT NULL,
    commit_sha character varying(255) NOT NULL,
    commit_message text,
    commit_author character varying(255),
    commit_date timestamp without time zone,
    status character varying(50) DEFAULT 'queued'::character varying NOT NULL,
    started_at timestamp without time zone,
    completed_at timestamp without time zone,
    duration_seconds integer,
    exit_code integer,
    error_message text,
    logs text,
    output_files jsonb,
    result_metadata text,
    execution_output text,
    execution_error text,
    execution_method character varying(100),
    validation_status character varying(50),
    validation_policy text,
    validation_decision text,
    attestation text,
    ai_logs text,
    ai_enabled boolean DEFAULT true NOT NULL,
    zkp_enabled boolean DEFAULT true NOT NULL,
    execution_metrics text,
    verification_receipt text,
    enclave_version text,
    enclave_pcr0 text,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    job_id_committed character varying,
    researcher_nonce character varying,
    commitment_receipt text,
    ha_receipt text,
    release_status character varying(20),
    ai_decision character varying(32),
    output_sha256 character varying(64),
    project_id uuid,
    archetype_id character varying(255),
    CONSTRAINT job_requests_output_sha256_check CHECK (((output_sha256 IS NULL) OR ((output_sha256)::text ~ '^[0-9a-f]{64}$'::text))),
    CONSTRAINT job_requests_release_status_check CHECK (((release_status IS NULL) OR ((release_status)::text = ANY ((ARRAY['pending'::character varying, 'released'::character varying, 'withheld'::character varying, 'not_required'::character varying])::text[]))))
);

-- Name: release_decisions; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.release_decisions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    job_id character varying(255) NOT NULL,
    decision character varying(10) NOT NULL,
    output_sha256 character varying(64) NOT NULL,
    reviewer_id uuid NOT NULL,
    reason text,
    decided_at timestamp with time zone DEFAULT now() NOT NULL,
    project_id uuid,
    files_manifest_sha256 character varying(64),
    CONSTRAINT release_decisions_decision_check CHECK (((decision)::text = ANY ((ARRAY['approve'::character varying, 'reject'::character varying])::text[]))),
    CONSTRAINT release_decisions_output_sha256_check CHECK (((output_sha256)::text ~ '^[0-9a-f]{64}$'::text)),
    CONSTRAINT release_decisions_reason_required CHECK ((((decision)::text = 'approve'::text) OR ((reason IS NOT NULL) AND (length(btrim(reason)) > 0))))
);

-- Name: reviewer_projects; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.reviewer_projects (
    user_id uuid NOT NULL,
    project_id uuid NOT NULL,
    synced_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Name: users; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    external_id character varying(255) NOT NULL,
    username character varying(255) NOT NULL,
    email character varying(255) NOT NULL,
    full_name character varying(255),
    avatar_url text,
    role character varying(50) DEFAULT 'user'::character varying NOT NULL,
    approval_status character varying(50) DEFAULT 'pending'::character varying NOT NULL,
    institution character varying(255),
    research_purpose text,
    expected_duration character varying(100),
    github_access_token text,
    github_username character varying(255),
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    approved_at timestamp without time zone,
    approved_by uuid
);

-- Name: workspaces; Type: TABLE; Schema: public; Owner: -

CREATE TABLE public.workspaces (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    name character varying(255) NOT NULL,
    description text,
    user_id uuid NOT NULL,
    github_repo character varying(255) NOT NULL,
    github_branch character varying(255) NOT NULL,
    status character varying(50) DEFAULT 'active'::character varying NOT NULL,
    created_at timestamp without time zone DEFAULT now(),
    updated_at timestamp without time zone DEFAULT now(),
    last_commit_sha character varying(255),
    last_commit_message text,
    last_commit_author character varying(255),
    last_commit_date timestamp without time zone
);

-- Name: job_logs job_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_logs
    ADD CONSTRAINT job_logs_pkey PRIMARY KEY (id);

-- Name: job_output_files job_output_files_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_output_files
    ADD CONSTRAINT job_output_files_pkey PRIMARY KEY (job_id, name);

-- Name: job_outputs job_outputs_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_outputs
    ADD CONSTRAINT job_outputs_pkey PRIMARY KEY (job_id);

-- Name: job_requests job_requests_job_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_job_id_unique UNIQUE (job_id);

-- Name: job_requests job_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_pkey PRIMARY KEY (id);

-- Name: release_decisions release_decisions_job_id_key; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.release_decisions
    ADD CONSTRAINT release_decisions_job_id_key UNIQUE (job_id);

-- Name: release_decisions release_decisions_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.release_decisions
    ADD CONSTRAINT release_decisions_pkey PRIMARY KEY (id);

-- Name: reviewer_projects reviewer_projects_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.reviewer_projects
    ADD CONSTRAINT reviewer_projects_pkey PRIMARY KEY (user_id, project_id);

-- Name: users users_external_id_unique; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_external_id_unique UNIQUE (external_id);

-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);

-- Name: workspaces workspaces_pkey; Type: CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_pkey PRIMARY KEY (id);

-- Name: ix_job_requests_job_id_committed; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ix_job_requests_job_id_committed ON public.job_requests USING btree (job_id_committed);

-- Name: ix_job_requests_project_release; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ix_job_requests_project_release ON public.job_requests USING btree (project_id, release_status);

-- Name: ix_job_requests_release_status; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ix_job_requests_release_status ON public.job_requests USING btree (release_status);

-- Name: ix_reviewer_projects_project; Type: INDEX; Schema: public; Owner: -

CREATE INDEX ix_reviewer_projects_project ON public.reviewer_projects USING btree (project_id);

-- Name: job_output_files job_output_files_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER job_output_files_guard BEFORE INSERT OR DELETE OR UPDATE ON public.job_output_files FOR EACH ROW EXECUTE FUNCTION public.job_output_files_guard();

-- Name: job_outputs job_outputs_files_manifest_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER job_outputs_files_manifest_guard BEFORE UPDATE OF files_manifest_sha256 ON public.job_outputs FOR EACH ROW EXECUTE FUNCTION public.job_outputs_files_manifest_guard();

-- Name: job_outputs job_outputs_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER job_outputs_guard BEFORE DELETE OR UPDATE ON public.job_outputs FOR EACH ROW EXECUTE FUNCTION public.job_outputs_guard();

-- Name: job_requests job_requests_project_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER job_requests_project_guard BEFORE UPDATE OF project_id, archetype_id ON public.job_requests FOR EACH ROW EXECUTE FUNCTION public.job_requests_project_guard();

-- Name: job_requests job_requests_release_guard; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER job_requests_release_guard BEFORE INSERT OR UPDATE ON public.job_requests FOR EACH ROW EXECUTE FUNCTION public.job_requests_release_guard();

-- Name: release_decisions release_decisions_before_insert; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER release_decisions_before_insert BEFORE INSERT ON public.release_decisions FOR EACH ROW EXECUTE FUNCTION public.release_decisions_before_insert();

-- Name: release_decisions release_decisions_immutable; Type: TRIGGER; Schema: public; Owner: -

CREATE TRIGGER release_decisions_immutable BEFORE DELETE OR UPDATE ON public.release_decisions FOR EACH ROW EXECUTE FUNCTION public.release_decisions_immutable();

-- Name: job_logs job_logs_job_id_job_requests_job_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_logs
    ADD CONSTRAINT job_logs_job_id_job_requests_job_id_fk FOREIGN KEY (job_id) REFERENCES public.job_requests(job_id) ON DELETE CASCADE;

-- Name: job_output_files job_output_files_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_output_files
    ADD CONSTRAINT job_output_files_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_outputs(job_id) ON DELETE CASCADE;

-- Name: job_outputs job_outputs_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_outputs
    ADD CONSTRAINT job_outputs_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_requests(job_id) ON DELETE CASCADE;

-- Name: job_requests job_requests_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: job_requests job_requests_workspace_id_workspaces_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.job_requests
    ADD CONSTRAINT job_requests_workspace_id_workspaces_id_fk FOREIGN KEY (workspace_id) REFERENCES public.workspaces(id) ON DELETE CASCADE;

-- Name: release_decisions release_decisions_job_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.release_decisions
    ADD CONSTRAINT release_decisions_job_id_fkey FOREIGN KEY (job_id) REFERENCES public.job_requests(job_id) ON DELETE CASCADE;

-- Name: release_decisions release_decisions_reviewer_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.release_decisions
    ADD CONSTRAINT release_decisions_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES public.users(id);

-- Name: reviewer_projects reviewer_projects_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.reviewer_projects
    ADD CONSTRAINT reviewer_projects_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

-- Name: workspaces workspaces_user_id_users_id_fk; Type: FK CONSTRAINT; Schema: public; Owner: -

ALTER TABLE ONLY public.workspaces
    ADD CONSTRAINT workspaces_user_id_users_id_fk FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE CASCADE;

