/**
 * Adapter between the Resona UI and the ClipContext backend (FastAPI, Part 1).
 *
 * The backend exposes sources (long videos) and clips (ranked vertical cuts with
 * evidence-grounded metadata). The UI was designed around projects, candidates,
 * accounts and publishing, so this module maps backend data onto the UI types.
 *
 * Things the backend does not have yet (projects, manual edits, publishing, analytics —
 * all "Part 2") are kept in this browser's localStorage or return empty results.
 */
import {
  Project,
  SourceAsset,
  SourceStage,
  ClipCandidate,
  ClipDetail,
  ClipPackage,
  EditingSequence,
  ConnectedAccount,
  PublishingJob,
  PerformanceSnapshot,
  ApprovalRecord,
  ProcessingJob,
  AuditEvent,
  IntegrationProviderStatus,
  HookStrategy,
  SystemStatus,
} from '../types';

// In dev, Vite proxies /api -> http://127.0.0.1:8000 (see vite.config.ts).
// For a separate deployment set VITE_API_BASE, e.g. http://localhost:8000 (the backend allows CORS).
const API_BASE = ((import.meta.env.VITE_API_BASE as string | undefined) || '/api').replace(/\/$/, '');

const PART2_MESSAGE =
  'Publishing, connected accounts and analytics are Part 2 and are not available in the ClipContext backend yet.';

// ------------------------------------------------------------------ auth token
const TOKEN_KEY = 'clipcontext_api_token';

function getToken(): string {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

// ------------------------------------------------------------------ http helpers
async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (init.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    throw new Error('Cannot reach the ClipContext backend. Is `python -m app.serve` running on port 8000?');
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    const message = Array.isArray(detail)
      ? detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ')
      : detail || `${res.status} ${res.statusText}`;
    throw new Error(message);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Turn a backend path (/media/..., /clips/{id}/download) into a browser URL. */
export function backendUrl(path: string | null | undefined): string | undefined {
  if (!path) return undefined;
  if (/^https?:\/\//.test(path)) return path;
  const token = getToken();
  const url = `${API_BASE}${path}`;
  return token ? `${url}${url.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}` : url;
}

// ------------------------------------------------------------------ local store (Part 2 / UI-only state)
interface LocalState {
  projects: Project[];
  sourceProject: Record<string, string>;
  sourceTitles: Record<string, string>;
  hiddenClips: string[];
  clipOverrides: Record<string, Partial<ClipCandidate>>;
  sequences: Record<string, EditingSequence>;
}

const STORE_KEY = 'resona_clipcontext_state_v1';
const DEFAULT_PROJECT_ID = 'default';

function nowIso() {
  return new Date().toISOString();
}

function defaultProject(): Project {
  const t = nowIso();
  return {
    id: DEFAULT_PROJECT_ID,
    name: 'My Workspace',
    description: 'Default workspace for videos processed by ClipContext.',
    status: 'active',
    tags: [],
    created_at: t,
    updated_at: t,
    source_count: 0,
    candidate_count: 0,
  };
}

function loadState(): LocalState {
  let state: Partial<LocalState> = {};
  try {
    state = JSON.parse(localStorage.getItem(STORE_KEY) || '{}');
  } catch {
    state = {};
  }
  const projects = state.projects?.length ? state.projects : [defaultProject()];
  return {
    projects,
    sourceProject: state.sourceProject || {},
    sourceTitles: state.sourceTitles || {},
    hiddenClips: state.hiddenClips || [],
    clipOverrides: state.clipOverrides || {},
    sequences: state.sequences || {},
  };
}

function saveState(state: LocalState) {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch {
    // storage unavailable (private window); UI-only state is simply not remembered
  }
}

function updateState(fn: (s: LocalState) => void): LocalState {
  const state = loadState();
  fn(state);
  saveState(state);
  return state;
}

function projectOf(sourceId: string, state: LocalState): string {
  const pid = state.sourceProject[sourceId];
  return pid && state.projects.some((p) => p.id === pid) ? pid : state.projects[0].id;
}

// ------------------------------------------------------------------ backend shapes
interface BackendSourceSummary {
  id: string;
  origin: 'url' | 'upload';
  url: string | null;
  title: string | null;
  duration_s: number | null;
  width: number | null;
  height: number | null;
  language_mode: string;
  channel_handle: string | null;
  status: string;
  stage: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
}

interface BackendSourceDetail extends BackendSourceSummary {
  analysis: { summary?: string | null; key_topics?: string[] | null } | null;
  stages: SourceStage[];
  clips: ClipDetail[];
  progress: { percent: number; source_stages_done: number; clips_done: number; clips_total: number };
}

const TERMINAL_SOURCE = new Set(['completed', 'completed_with_errors', 'error', 'cancelled']);

function analysisStatus(status: string): SourceAsset['analysis_status'] {
  if (status === 'queued') return 'pending';
  if (status === 'completed' || status === 'completed_with_errors') return 'completed';
  if (status === 'error' || status === 'cancelled') return 'failed';
  return 'analyzing';
}

function formatTimecode(secs: number) {
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = Math.floor(secs % 60);
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function sourceTitle(src: BackendSourceSummary, state: LocalState) {
  return state.sourceTitles[src.id] || src.title || src.url || 'Untitled video';
}

function toSourceAsset(src: BackendSourceDetail, state: LocalState): SourceAsset {
  return {
    id: src.id,
    project_id: projectOf(src.id, state),
    title: sourceTitle(src, state),
    original_filename: src.origin === 'url' ? src.url || '' : src.title || 'upload',
    duration_seconds: src.duration_s || 0,
    width: src.width || 0,
    height: src.height || 0,
    fps: 0,
    file_size_bytes: 0,
    mime_type: 'video/mp4',
    thumbnail_url: backendUrl(src.clips.find((c) => c.thumb_url)?.thumb_url),
    analysis_status: analysisStatus(src.status),
    analysis_progress: src.progress?.percent ?? 0,
    analysis_error: src.error || undefined,
    vocal_pauses_count: 0,
    frame_diversity_score: 0,
    perceptual_quality_score: 0,
    is_demo_asset: false,
    created_at: src.created_at,
    candidate_count: src.clips.filter((c) => !state.hiddenClips.includes(c.id)).length,
    origin: src.origin,
    source_url: src.url,
    backend_status: src.status,
    backend_stage: src.stage,
    language_mode: src.language_mode,
    channel_handle: src.channel_handle,
    summary: src.analysis?.summary ?? null,
    key_topics: src.analysis?.key_topics ?? [],
    stages: src.stages,
    clips_done: src.progress?.clips_done ?? 0,
    clips_total: src.progress?.clips_total ?? src.clips.length,
  };
}

function toCandidate(clip: ClipDetail, src: BackendSourceSummary, state: LocalState): ClipCandidate {
  const total = clip.scores?.total ?? 0;
  const base: ClipCandidate = {
    id: clip.id,
    project_id: projectOf(src.id, state),
    source_asset_id: src.id,
    variant_name: `Clip #${clip.rank}`,
    hook_strategy: clip.hook_type || 'none',
    hook_rationale: clip.reasoning || '',
    title: clip.hook_title || `Clip #${clip.rank}`,
    description: '',
    hashtags: [],
    start_time: clip.t_start,
    end_time: clip.t_end,
    aspect_ratio: '9:16',
    crop_center_x: 0.5,
    crop_center_y: 0.5,
    crop_scale: 1,
    lifecycle_status: clip.status === 'done' ? 'ready_for_review' : 'draft',
    manual_edits_count: 0,
    is_favorite: false,
    is_demo: false,
    ranking_score: total,
    ranking_confidence: clip.status === 'done' ? 1 : 0,
    ranking_rationale: clip.reasoning || '',
    grounding_verified: clip.status === 'done',
    grounding_source_timecode: `${formatTimecode(clip.t_start)} – ${formatTimecode(clip.t_end)}`,
    rendered_file_url: backendUrl(clip.video_url),
    thumbnail_url: backendUrl(clip.thumb_url),
    created_at: src.created_at,
    updated_at: src.updated_at,
    source_video_title: sourceTitle(src, state),
    source_video_url: src.url || undefined,
    rank: clip.rank,
    scores: clip.scores,
    backend_status: clip.status,
    backend_error: clip.error,
    download_url: backendUrl(clip.download_url),
  };
  return { ...base, ...(state.clipOverrides[clip.id] || {}) };
}

// Several screens load sources and clips at the same time; share one round of requests.
let detailsCache: { at: number; promise: Promise<BackendSourceDetail[]> } | null = null;

function invalidateCache() {
  detailsCache = null;
}

function fetchSourceDetails(): Promise<BackendSourceDetail[]> {
  if (detailsCache && Date.now() - detailsCache.at < 2000) return detailsCache.promise;
  const promise = request<BackendSourceSummary[]>('/sources?limit=200').then((list) =>
    Promise.all(list.map((s) => request<BackendSourceDetail>(`/sources/${s.id}`))),
  );
  detailsCache = { at: Date.now(), promise };
  promise.catch(invalidateCache);
  return promise;
}

const HOOK_STRATEGIES: HookStrategy[] = [
  { id: 'question', name: 'Question', category: 'curiosity', description: 'Opens with a question the clip answers.', pacing_hint: 'Fast open', icon: 'help-circle' },
  { id: 'bold_claim', name: 'Bold Claim', category: 'authority', description: 'Leads with a strong, surprising statement.', pacing_hint: 'Punchy', icon: 'zap' },
  { id: 'statistic', name: 'Statistic', category: 'authority', description: 'Hooks with a concrete number or data point.', pacing_hint: 'Punchy', icon: 'bar-chart' },
  { id: 'story', name: 'Story', category: 'narrative', description: 'A personal story or anecdote with a payoff.', pacing_hint: 'Build-up', icon: 'book-open' },
  { id: 'contrast', name: 'Contrast', category: 'contrarian', description: 'Before/after or expectation vs reality.', pacing_hint: 'Two beats', icon: 'git-compare' },
  { id: 'how_to', name: 'How-to', category: 'value', description: 'A practical tip or step the viewer can use.', pacing_hint: 'Steady', icon: 'wrench' },
  { id: 'emotional', name: 'Emotional', category: 'emotion', description: 'A moment with strong feeling or reaction.', pacing_hint: 'Let it breathe', icon: 'heart' },
  { id: 'none', name: 'No specific hook', category: 'other', description: 'Selected for overall value rather than a hook type.', pacing_hint: '-', icon: 'circle' },
];

function defaultSequence(c: ClipCandidate): EditingSequence {
  return {
    candidate_id: c.id,
    aspect_ratio: c.aspect_ratio,
    crop_x: c.crop_center_x,
    crop_y: c.crop_center_y,
    crop_scale: c.crop_scale,
    segments: [{ id: 'seg_1', start: c.start_time, end: c.end_time, speed: 1, volume: 1 }],
    text_overlays: [],
    safe_area_platform: 'shorts',
  };
}

export const api = {
  // ---------------------------------------------------------------- auth / system
  getApiToken: getToken,

  setApiToken(token: string) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // ignore
    }
    invalidateCache();
  },

  async getHealth(): Promise<{ ok: boolean; llm_mode: string }> {
    return request('/health');
  },

  async getSystemStatus(): Promise<SystemStatus> {
    return request('/system/status');
  },

  // ---------------------------------------------------------------- projects (local only)
  async getProjects(): Promise<Project[]> {
    const state = loadState();
    saveState(state);
    let details: BackendSourceDetail[] = [];
    try {
      details = await fetchSourceDetails();
    } catch {
      // backend offline: still show the local projects
    }
    return state.projects.map((p) => {
      const sources = details.filter((d) => projectOf(d.id, state) === p.id);
      return {
        ...p,
        source_count: sources.length,
        candidate_count: sources.reduce(
          (n, d) => n + d.clips.filter((c) => !state.hiddenClips.includes(c.id)).length,
          0,
        ),
      };
    });
  },

  async createProject(name: string, description: string, tags: string[] = []): Promise<Project> {
    const t = nowIso();
    const project: Project = {
      id: `proj_${Date.now().toString(36)}`,
      name,
      description,
      status: 'active',
      tags,
      created_at: t,
      updated_at: t,
      source_count: 0,
      candidate_count: 0,
    };
    updateState((s) => s.projects.push(project));
    return project;
  },

  async deleteProject(id: string): Promise<void> {
    const state = loadState();
    if (state.projects.length <= 1) throw new Error('You need at least one project.');
    updateState((s) => {
      s.projects = s.projects.filter((p) => p.id !== id);
      // videos in the deleted project move to the first remaining project
      for (const [sid, pid] of Object.entries(s.sourceProject)) if (pid === id) delete s.sourceProject[sid];
    });
  },

  // ---------------------------------------------------------------- sources
  async getSourceAssets(projectId?: string): Promise<SourceAsset[]> {
    const state = loadState();
    const details = await fetchSourceDetails();
    return details
      .map((d) => toSourceAsset(d, state))
      .filter((s) => !projectId || s.project_id === projectId);
  },

  async getSourceAsset(id: string): Promise<SourceAsset> {
    const detail = await request<BackendSourceDetail>(`/sources/${id}`);
    return toSourceAsset(detail, loadState());
  },

  /** The backend runs analysis automatically; this resumes a failed or cancelled source. */
  async runStage1Analysis(assetId: string): Promise<SourceAsset> {
    return api.resumeSource(assetId);
  },

  async resumeSource(id: string): Promise<SourceAsset> {
    await request(`/sources/${id}/resume`, { method: 'POST' });
    invalidateCache();
    return api.getSourceAsset(id);
  },

  async cancelSource(id: string): Promise<SourceAsset> {
    await request(`/sources/${id}/cancel`, { method: 'POST' });
    invalidateCache();
    return api.getSourceAsset(id);
  },

  async deleteSource(id: string): Promise<void> {
    await request(`/sources/${id}`, { method: 'DELETE' });
    invalidateCache();
    updateState((s) => {
      delete s.sourceProject[id];
      delete s.sourceTitles[id];
    });
  },

  async uploadMedia(
    projectId: string,
    file: File,
    title?: string,
    options: { languageMode?: 'en' | 'hinglish'; channelHandle?: string } = {},
  ): Promise<SourceAsset> {
    const formData = new FormData();
    formData.append('file', file);
    if (options.languageMode) formData.append('language_mode', options.languageMode);
    if (options.channelHandle) formData.append('channel_handle', options.channelHandle);

    const created = await request<BackendSourceSummary>('/sources/upload', { method: 'POST', body: formData });
    invalidateCache();
    updateState((s) => {
      s.sourceProject[created.id] = projectId;
      if (title && title.trim()) s.sourceTitles[created.id] = title.trim();
    });
    return api.getSourceAsset(created.id);
  },

  async importFromUrl(
    projectId: string,
    url: string,
    options: { title?: string; languageMode?: 'en' | 'hinglish'; channelHandle?: string } = {},
  ): Promise<SourceAsset> {
    const created = await request<BackendSourceSummary>('/sources', {
      method: 'POST',
      body: JSON.stringify({
        url,
        language_mode: options.languageMode || null,
        channel_handle: options.channelHandle || null,
      }),
    });
    invalidateCache();
    updateState((s) => {
      s.sourceProject[created.id] = projectId;
      if (options.title && options.title.trim()) s.sourceTitles[created.id] = options.title.trim();
    });
    return api.getSourceAsset(created.id);
  },

  // ---------------------------------------------------------------- clips as candidates
  async getCandidates(params?: {
    projectId?: string;
    sourceAssetId?: string;
    lifecycleStatus?: string;
    hookStrategy?: string;
  }): Promise<ClipCandidate[]> {
    const state = loadState();
    const details = await fetchSourceDetails();
    return details
      .filter((d) => !params?.sourceAssetId || d.id === params.sourceAssetId)
      .flatMap((d) => d.clips.map((c) => toCandidate(c, d, state)))
      .filter((c) => !state.hiddenClips.includes(c.id))
      .filter((c) => !params?.projectId || c.project_id === params.projectId)
      .filter((c) => !params?.lifecycleStatus || c.lifecycle_status === params.lifecycleStatus)
      .filter((c) => !params?.hookStrategy || c.hook_strategy === params.hookStrategy)
      .sort((a, b) => b.ranking_score - a.ranking_score);
  },

  async getCandidate(id: string): Promise<ClipCandidate> {
    const clip = await api.getClipDetail(id);
    const source = await request<BackendSourceSummary>(`/sources/${clip.source_id}`);
    const state = loadState();
    const candidate = toCandidate(clip, source, state);
    const overrides = state.clipOverrides[id] || {};
    if (clip.status === 'done') {
      try {
        const pkg = await api.getClipPackage(id);
        if (!overrides.title && pkg.title) candidate.title = pkg.title;
        if (!overrides.description) candidate.description = pkg.description;
        if (!overrides.hashtags) candidate.hashtags = pkg.hashtags;
      } catch {
        // metadata not generated yet
      }
    }
    return candidate;
  },

  async createCandidate(_payload: {
    project_id: string;
    source_asset_id: string;
    variant_name?: string;
    hook_strategy: string;
    title: string;
    description?: string;
    hashtags?: string[];
    start_time: number;
    end_time: number;
    aspect_ratio?: '9:16' | '1:1' | '16:9';
    is_demo?: boolean;
  }): Promise<ClipCandidate> {
    throw new Error('ClipContext selects and renders clips automatically; manual clips are not supported yet.');
  },

  /** Edits are kept in this browser only; the backend's rendered clip is not changed. */
  async updateCandidate(id: string, updates: Partial<ClipCandidate>): Promise<ClipCandidate> {
    updateState((s) => {
      const prev = s.clipOverrides[id] || {};
      s.clipOverrides[id] = { ...prev, ...updates, manual_edits_count: (prev.manual_edits_count || 0) + 1 };
    });
    return api.getCandidate(id);
  },

  async duplicateCandidate(_id: string): Promise<ClipCandidate> {
    throw new Error('Duplicating clips is not supported by the ClipContext backend.');
  },

  /** Hides the clip in this browser. Delete the whole source to remove files from the server. */
  async deleteCandidate(id: string): Promise<void> {
    updateState((s) => {
      if (!s.hiddenClips.includes(id)) s.hiddenClips.push(id);
    });
  },

  async getClipDetail(id: string): Promise<ClipDetail> {
    return request<ClipDetail>(`/clips/${id}`);
  },

  async getClipMetadata(id: string, all = false): Promise<NonNullable<ClipDetail['metadata']>> {
    return request(`/clips/${id}/metadata${all ? '?all=true' : ''}`);
  },

  async getClipPackage(id: string): Promise<ClipPackage> {
    return request<ClipPackage>(`/clips/${id}/package`);
  },

  async selectTitle(clipId: string, titleId: string, regenerateDependents = true) {
    return request<{ chosen_title_id: string; regenerating: boolean }>(`/clips/${clipId}/select-title`, {
      method: 'POST',
      body: JSON.stringify({ title_id: titleId, regenerate_dependents: regenerateDependents }),
    });
  },

  async regenerateMetadata(clipId: string, pool: 'title' | 'description' | 'hashtags', titleId?: string) {
    return request<{ queued: boolean; pool: string }>(`/clips/${clipId}/metadata/regenerate`, {
      method: 'POST',
      body: JSON.stringify({ pool, title_id: titleId || null }),
    });
  },

  clipDownloadUrl(clipId: string): string {
    return backendUrl(`/clips/${clipId}/download`)!;
  },

  // ---------------------------------------------------------------- editor (local only)
  async getSequence(candidateId: string): Promise<EditingSequence> {
    const saved = loadState().sequences[candidateId];
    if (saved) return saved;
    return defaultSequence(await api.getCandidate(candidateId));
  },

  async saveSequence(candidateId: string, sequence: EditingSequence): Promise<{ status: string }> {
    updateState((s) => {
      s.sequences[candidateId] = sequence;
    });
    return { status: 'saved_locally' };
  },

  /** The worker renders every clip automatically; this returns the rendered file. */
  async renderCandidate(candidateId: string): Promise<{ output_url: string; output_path: string }> {
    const clip = await api.getClipDetail(candidateId);
    if (!clip.video_url) {
      throw new Error(`This clip has not been rendered yet (status: ${clip.status}). The worker renders clips automatically.`);
    }
    return { output_url: backendUrl(clip.video_url)!, output_path: api.clipDownloadUrl(candidateId) };
  },

  // ---------------------------------------------------------------- accounts & publishing (Part 2)
  async getAccounts(_accountType?: 'canary_test' | 'main_channel'): Promise<ConnectedAccount[]> {
    return [];
  },

  async createAccount(_data: {
    account_type: 'canary_test' | 'main_channel';
    platform: 'youtube_shorts' | 'tiktok' | 'instagram_reels';
    account_handle: string;
    display_name: string;
    subscribers_count?: number;
    is_simulation_mode?: boolean;
  }): Promise<ConnectedAccount> {
    throw new Error(PART2_MESSAGE);
  },

  async updateAccount(_id: string, _updates: Partial<ConnectedAccount>): Promise<ConnectedAccount> {
    throw new Error(PART2_MESSAGE);
  },

  async getPublishingJobs(): Promise<PublishingJob[]> {
    return [];
  },

  async publishToCanary(_payload: {
    project_id: string;
    candidate_id: string;
    account_id: string;
    title_override?: string;
    description_override?: string;
    hashtags_override?: string[];
  }): Promise<PublishingJob> {
    throw new Error(PART2_MESSAGE);
  },

  async promoteToMainChannel(_payload: {
    candidate_id: string;
    main_account_id: string;
    approved_by: string;
    acknowledgement_checked: boolean;
    notes?: string;
    override_title?: string;
    override_description?: string;
  }): Promise<PublishingJob> {
    throw new Error(PART2_MESSAGE);
  },

  async getCandidateApprovals(_candidateId: string): Promise<ApprovalRecord[]> {
    return [];
  },

  // ---------------------------------------------------------------- analytics (Part 2)
  async getAnalyticsOverview(): Promise<any> {
    return { total_published_tests: 0, total_test_views: 0, average_completion_rate: 0, viral_leader: null };
  },

  async getCandidatePerformance(_candidateId: string): Promise<PerformanceSnapshot[]> {
    return [];
  },

  async compareCandidates(_ids: string[]): Promise<any[]> {
    return [];
  },

  // ---------------------------------------------------------------- integrations
  async getIntegrations(): Promise<IntegrationProviderStatus[]> {
    const sys = await api.getSystemStatus();
    const item = (
      id: string,
      name: string,
      category: string,
      ok: boolean,
      description: string,
      notes: string,
      okLabel = 'Configured',
      missingLabel = 'Not configured',
    ): IntegrationProviderStatus => ({
      id,
      name,
      category,
      status: ok ? 'connected' : 'not_configured',
      status_label: ok ? okLabel : missingLabel,
      description,
      inputs_required: [],
      outputs_expected: [],
      assigned_teammate: 'ClipContext backend',
      implementation_notes: notes,
      mock_mode: sys.llm_mode === 'fake',
    });
    const models = (role: string) => (sys.models[role] || []).join(', ') || '—';
    return [
      item('gemini', 'Google Gemini', 'LLM', sys.keys.google,
        'Clip selection, frame captions and the independent metadata judge.',
        `Selection: ${models('selection')} · Vision: ${models('vision')} · Judge: ${models('judge')}. Set GOOGLE_API_KEY in .env.`),
      item('groq', 'Groq', 'LLM / Speech', sys.keys.groq,
        'Whisper transcription and title/description/hashtag generation.',
        `Generator: ${models('generator')}. Without a key, transcription falls back to local faster-whisper. Set GROQ_API_KEY in .env.`),
      item('youtube', 'YouTube Data API', 'Trends', sys.keys.youtube,
        'Niche search for benchmark titles and the style profile.',
        'Search only, no OAuth. Without a key a default style profile is used. Set YOUTUBE_API_KEY in .env.'),
      item('transcription', 'Transcription', 'Speech', true,
        'Word-level timestamps for captions and clip boundaries.',
        `Provider: ${sys.transcription_provider}.`, sys.transcription_provider.toUpperCase()),
      item('ffmpeg', 'FFmpeg', 'Media', sys.ffmpeg,
        'Audio extraction, cropping, captions and rendering.',
        'ffmpeg and ffprobe must be on the PATH of the worker.', 'Found on PATH', 'Missing'),
      item('face_model', 'YuNet face model', 'Vision', sys.face_model,
        'Face tracking for the vertical crop.',
        'Missing model falls back to Haar cascade, then a centre crop. Run scripts/download_models.py.', 'Installed', 'Fallback in use'),
      {
        id: 'publishing',
        name: 'Publishing & analytics',
        category: 'Part 2',
        status: 'awaiting_implementation',
        status_label: 'Part 2',
        description: 'Account connection, canary publishing and performance tracking.',
        inputs_required: [],
        outputs_expected: [],
        assigned_teammate: 'Part 2',
        implementation_notes: PART2_MESSAGE,
        mock_mode: false,
      },
    ];
  },

  async getHookStrategies(): Promise<HookStrategy[]> {
    return HOOK_STRATEGIES;
  },

  // ---------------------------------------------------------------- jobs & activity
  async getProcessingJobs(): Promise<ProcessingJob[]> {
    const state = loadState();
    const details = await fetchSourceDetails();
    return details.map((d) => {
      const status: ProcessingJob['status'] =
        d.status === 'queued' ? 'queued'
          : d.status === 'error' || d.status === 'cancelled' ? 'failed'
            : TERMINAL_SOURCE.has(d.status) ? 'completed' : 'processing';
      const step = d.status === 'clips_processing'
        ? `clips ${d.progress.clips_done}/${d.progress.clips_total}`
        : d.stage || d.status;
      return {
        id: d.id,
        job_type: sourceTitle(d, state),
        resource_id: d.id,
        status,
        progress: d.progress?.percent ?? 0,
        step_description: `${step} (${d.status})`,
        error: d.error || undefined,
        created_at: d.created_at,
        finished_at: TERMINAL_SOURCE.has(d.status) ? d.updated_at : undefined,
      };
    });
  },

  async getActivityHistory(): Promise<AuditEvent[]> {
    const state = loadState();
    const details = await fetchSourceDetails();
    const events: AuditEvent[] = [];
    for (const d of details) {
      const clipRank = new Map(d.clips.map((c) => [c.id, c.rank]));
      d.stages.forEach((st, i) => {
        const where = st.clip_id ? ` · clip #${clipRank.get(st.clip_id) ?? '?'}` : '';
        const took = st.seconds != null ? ` in ${st.seconds.toFixed(1)}s` : '';
        events.push({
          id: `${d.id}-${i}`,
          event_type: `${st.stage}.${st.status}`,
          actor: 'worker',
          description: `${sourceTitle(d, state)}${where}: ${st.stage} ${st.status}${took}${st.error ? ` — ${st.error}` : ''}`,
          created_at: st.finished_at || st.started_at || d.updated_at,
        });
      });
    }
    return events.sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 200);
  },
};
