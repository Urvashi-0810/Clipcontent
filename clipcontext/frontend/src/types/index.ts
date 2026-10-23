export interface Project {
  id: string;
  name: string;
  description: string;
  status: 'active' | 'archived' | 'completed';
  tags: string[];
  created_at: string;
  updated_at: string;
  source_count: number;
  candidate_count: number;
}

export interface SourceAsset {
  id: string;
  project_id: string;
  title: string;
  original_filename: string;
  duration_seconds: number;
  width: number;
  height: number;
  fps: number;
  file_size_bytes: number;
  mime_type: string;
  file_url?: string;
  thumbnail_url?: string;
  analysis_status: 'pending' | 'analyzing' | 'completed' | 'failed';
  analysis_progress: number;
  analysis_error?: string;
  vocal_pauses_count: number;
  frame_diversity_score: number;
  perceptual_quality_score: number;
  is_demo_asset: boolean;
  created_at: string;
  candidate_count: number;
  // ClipContext backend fields
  origin?: 'url' | 'upload';
  source_url?: string | null;
  backend_status?: string;
  backend_stage?: string | null;
  language_mode?: string;
  channel_handle?: string | null;
  summary?: string | null;
  key_topics?: string[];
  stages?: SourceStage[];
  clips_done?: number;
  clips_total?: number;
}

export interface SourceStage {
  clip_id: string | null;
  stage: string;
  status: 'running' | 'done' | 'error' | 'skipped';
  started_at: string | null;
  finished_at: string | null;
  seconds: number | null;
  error: string | null;
}

export interface ClipScores {
  hook?: number;
  engagement?: number;
  value?: number;
  shareability?: number;
  total?: number;
}

export interface MetadataCandidate {
  id: string;
  pool: 'title' | 'description' | 'hashtags';
  rank: number | null;
  strategy: string | null;
  text: string | null;
  hashtags: string[] | null;
  tags: string[] | null;
  passed_filters: boolean;
  final_score: number | null;
  judge_reason: string | null;
  filter_flags?: Record<string, unknown> | string[] | null;
}

export interface EvidenceFact {
  fact_key: string;
  kind: string;
  t_start: number;
  t_end: number;
  text: string;
  frame_url: string | null;
}

export interface ClipDetail {
  id: string;
  source_id: string;
  rank: number;
  t_start: number;
  t_end: number;
  duration_s: number;
  hook_title: string | null;
  hook_type: string | null;
  scores: ClipScores;
  reasoning: string | null;
  status: string;
  stage: string | null;
  error: string | null;
  chosen_title_id: string | null;
  video_url: string | null;
  thumb_url: string | null;
  download_url: string | null;
  metadata?: { title: MetadataCandidate[]; description: MetadataCandidate[]; hashtags: MetadataCandidate[] };
  evidence?: EvidenceFact[];
}

export interface ClipPackage {
  title: string | null;
  description: string;
  hashtags: string[];
  tags: string[];
  youtube_category_id: string | null;
  language: string;
}

export interface SystemStatus {
  llm_mode: string;
  keys: { google: boolean; groq: boolean; youtube: boolean };
  models: Record<string, string[]>;
  transcription_provider: string;
  ffmpeg: boolean;
  face_model: boolean;
  media_dir: string;
}

export interface ClipCandidate {
  id: string;
  project_id: string;
  source_asset_id: string;
  variant_name: string;
  hook_strategy: string;
  hook_rationale: string;
  title: string;
  description: string;
  hashtags: string[];
  start_time: number;
  end_time: number;
  aspect_ratio: '9:16' | '1:1' | '16:9';
  crop_center_x: number;
  crop_center_y: number;
  crop_scale: number;
  lifecycle_status:
    | 'draft'
    | 'ready_for_review'
    | 'approved_for_testing'
    | 'queued_for_test'
    | 'publishing_test'
    | 'published_test'
    | 'awaiting_metrics'
    | 'evaluated'
    | 'selected_for_main'
    | 'approved_for_main'
    | 'published_main'
    | 'archived';
  manual_edits_count: number;
  is_favorite: boolean;
  is_demo: boolean;
  ranking_score: number;
  ranking_confidence: number;
  ranking_rationale: string;
  grounding_verified: boolean;
  grounding_source_timecode: string;
  rendered_file_url?: string;
  thumbnail_url?: string;
  created_at: string;
  updated_at: string;
  source_video_title?: string;
  source_video_url?: string;
  // ClipContext backend fields
  rank?: number;
  scores?: ClipScores;
  backend_status?: string;
  backend_error?: string | null;
  download_url?: string | null;
}

export interface ClipSegment {
  id: string;
  start: number;
  end: number;
  speed: number;
  volume: number;
}

export interface TextOverlay {
  id: string;
  text: string;
  x: number;
  y: number;
  start: number;
  end: number;
  fontSize: number;
  color: string;
  bgColor?: string;
}

export interface EditingSequence {
  candidate_id: string;
  aspect_ratio: '9:16' | '1:1' | '16:9';
  crop_x: number;
  crop_y: number;
  crop_scale: number;
  segments: ClipSegment[];
  text_overlays: TextOverlay[];
  safe_area_platform: 'tiktok' | 'reels' | 'shorts' | 'custom';
}

export interface ConnectedAccount {
  id: string;
  account_type: 'canary_test' | 'main_channel';
  platform: 'youtube_shorts' | 'tiktok' | 'instagram_reels';
  account_handle: string;
  display_name: string;
  avatar_url?: string;
  is_active: boolean;
  is_simulation_mode: boolean;
  subscribers_count: number;
  last_synced_at: string;
  credentials_configured: boolean;
}

export interface PublishingJob {
  id: string;
  project_id: string;
  candidate_id: string;
  account_id: string;
  target_destination: 'canary_test' | 'main_channel';
  status: 'queued' | 'uploading' | 'published' | 'failed' | 'cancelled';
  progress: number;
  error_message?: string;
  published_video_id?: string;
  published_video_url?: string;
  title_override?: string;
  description_override?: string;
  hashtags_override?: string[];
  scheduled_for?: string;
  published_at?: string;
  created_at: string;
  is_simulation: boolean;
  candidate_title?: string;
  account_display_name?: string;
  platform?: string;
}

export interface PerformanceSnapshot {
  id: string;
  candidate_id: string;
  platform: string;
  captured_at: string;
  hours_since_publish: number;
  views: number;
  likes: number;
  comments: number;
  shares: number;
  watch_time_seconds: number;
  avg_view_duration_seconds: number;
  completion_rate_percent: number;
  engagement_rate_percent: number;
  velocity_score: number;
  is_demo_data: boolean;
}

export interface ApprovalRecord {
  id: string;
  candidate_id: string;
  action_type: 'approve_for_canary' | 'promote_to_main' | 'reject';
  approved_by: string;
  notes: string;
  created_at: string;
  previous_status: string;
  new_status: string;
  metrics_at_approval: Record<string, any>;
}

export interface ProcessingJob {
  id: string;
  job_type: string;
  resource_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  step_description: string;
  error?: string;
  created_at: string;
  finished_at?: string;
}

export interface AuditEvent {
  id: string;
  event_type: string;
  actor: string;
  description: string;
  created_at: string;
}

export interface IntegrationProviderStatus {
  id: string;
  name: string;
  category: string;
  status: 'not_configured' | 'awaiting_implementation' | 'demo_data' | 'ready_for_integration' | 'connected' | 'failed';
  status_label: string;
  description: string;
  inputs_required: string[];
  outputs_expected: string[];
  assigned_teammate: string;
  implementation_notes: string;
  mock_mode: boolean;
}

export interface HookStrategy {
  id: string;
  name: string;
  category: string;
  description: string;
  pacing_hint: string;
  icon: string;
}
