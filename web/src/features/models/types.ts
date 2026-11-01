/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import { z } from 'zod'

import type { PricingValues } from '@/features/model-pricing/pricing'

// ============================================================================
// Model Types
// ============================================================================

/**
 * Bound channel information
 */
export interface BoundChannel {
  name: string
  type: number
}

/**
 * Model entity from API
 */
export type ModelSquareState = 'visible' | 'unavailable' | 'hidden' | 'partial'

export interface Model {
  square_state?: ModelSquareState
  has_metadata?: boolean
  configured_channel_count?: number
  id: number
  model_name: string
  description?: string
  icon?: string
  tags?: string
  vendor_id?: number
  endpoints?: string
  supported_endpoints?: string[]
  status: number
  /** Shown to users while status is MODEL_STATUS.UNAVAILABLE. */
  unavailable_reason?: string
  sync_official: number
  created_time: number
  updated_time: number
  name_rule: number
  // Runtime fields
  bound_channels?: BoundChannel[]
  enable_groups?: string[]
  quota_types?: number[]
  matched_models?: string[]
  matched_count?: number
}

/**
 * Vendor entity from API
 */
export interface Vendor {
  model_count?: number
  version?: string
  id: number
  name: string
  description?: string
  icon?: string
  status: number
  created_time: number
  updated_time: number
}

/**
 * Prefill group entity
 */
export interface PrefillGroup {
  id: number
  name: string
  type: 'model' | 'tag' | 'endpoint'
  items: string | string[]
  description?: string
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Get models list parameters
 */
export interface GetModelsParams {
  square_state?: ModelSquareState
  include_channel_models?: boolean
  p?: number
  page_size?: number
  vendor?: string // vendor ID to filter by
  status?: string // filter by status
  sync_official?: string // filter by sync_official status
}

/**
 * Search models parameters
 */
export interface SearchModelsParams {
  square_state?: ModelSquareState
  include_channel_models?: boolean
  keyword?: string
  vendor?: string // vendor ID to filter by
  status?: string // filter by status
  sync_official?: string // filter by sync_official status
  p?: number
  page_size?: number
}

/**
 * Get models response
 */
export interface GetModelsResponse {
  success: boolean
  message?: string
  data?: {
    items: Model[]
    total: number
    page: number
    page_size: number
    vendor_counts?: Record<string, number>
  }
}

/**
 * Get model detail response
 */
export interface GetModelResponse {
  success: boolean
  message?: string
  data?: Model
}

/**
 * Get vendors response
 */
export interface GetVendorsResponse {
  success: boolean
  message?: string
  data?: {
    items: Vendor[]
    total: number
    page: number
    page_size: number
  }
}

/**
 * Get vendor response
 */
export interface GetVendorResponse {
  success: boolean
  message?: string
  data?: Vendor
}

/**
 * Sync diff data
 */
export type MetadataSyncField =
  | 'description'
  | 'icon'
  | 'tags'
  | 'vendor'
  | 'endpoints'
  | 'name_rule'
  | 'status'
export type MetadataSyncValues = {
  description: string
  icon: string
  tags: string
  vendor: string
  endpoints: string
  name_rule: number
  status: number
}
export type MetadataSyncCandidate = {
  model_name: string
  kind:
    | 'create'
    | 'update'
    | 'unchanged'
    | 'blocked'
    | 'missing_upstream'
    | 'missing_vendor'
  scope: 'site' | 'catalog'
  record_version: string
  fields: Array<{
    field: MetadataSyncField
    local: string | number
    upstream: string | number
  }>
  upstream?: MetadataSyncValues
  vendor_to_create?: string
}
export type MetadataSyncSource = {
  locale: SyncLocale
  models_url: string
  vendors_url: string
  version: string
}
export type MetadataSyncPreview = {
  source: MetadataSyncSource
  candidates: MetadataSyncCandidate[]
}
export type MetadataSyncSelection = {
  model_name: string
  record_version: string
  create: boolean
  fields: MetadataSyncField[]
}
export type MetadataSyncRequest = {
  locale: SyncLocale
  source_version: string
  selections: MetadataSyncSelection[]
}
export type MetadataSyncResult = {
  created_models: string[]
  updated_models: MetadataSyncSelection[]
  created_vendors: string[]
}
export interface SyncUpstreamResponse {
  success: boolean
  message?: string
  data?: MetadataSyncResult
}
export interface PreviewUpstreamDiffResponse {
  success: boolean
  message?: string
  data?: MetadataSyncPreview
}

/**
 * A channel that offers or already serves an onboarding model
 */
export type OnboardingChannel = {
  id: number
  name: string
  type: number
  group: string
  status: number
  /** The channel's task plugin does not list this pending model yet. */
  plugin_missing?: boolean
  /** Task plugin bound to a Task Plugin channel. */
  plugin_key?: string
  /** Last attempt to adapt that plugin to the model from supplier prices. */
  plugin_adaptation?: OnboardingPluginAdaptation
}

export type OnboardingPluginAdaptation = {
  adapted: boolean
  /** Declared model the durations and ratios were copied from. */
  based_on?: string
  /** English message key of a failed or waiting attempt. */
  error?: string
  updated_at: number
}

/**
 * A concrete model name in the onboarding workbench
 */
export type OnboardingModel = {
  model_name: string
  pending_channels: OnboardingChannel[]
  removed_channels: OnboardingChannel[]
  channels: OnboardingChannel[]
  metadata_id: number
  metadata_rule?: string
  /** Prepared metadata of a model that has none yet. */
  draft?: OnboardingDraft
}

export type OnboardingDraft = {
  description: string
  icon?: string
  /** Comma-separated. */
  tags?: string
  vendor_id?: number
  /** Model whose icon, tags and vendor were copied. */
  based_on?: string
  /** A language model wrote the description. */
  polished: boolean
  /** English message key of why the description was not polished. */
  error?: string
  generated_at: number
}

/** Result of one upstream sync run (system task upstream_price_check). */
export type OnboardingSyncSummary = {
  detection?: {
    checked_channels: number
    changed_channels: number
    detected_add_models: number
    detected_remove_models: number
    failed_channels: number
  }
  checked_channels: number
  failed_channels: number
  failures?: Array<{ channel_name: string; error: string }>
  changes: number
  applied_models?: string[]
  adapted_models?: string[]
  waiting_models?: number
  drafted_models?: string[]
}

export type DescriptionLLMConfig = {
  base_url: string
  model: string
  has_key: boolean
}

export interface OnboardingOverviewResponse {
  success: boolean
  message?: string
  data?: {
    items: OnboardingModel[]
    tags: string[]
  }
}

/**
 * A channel whose upstream new-api pricing can be watched
 */
export type UpstreamPriceChannel = {
  id: number
  name: string
  base_url: string
  has_token: boolean
  baseline_time: number
  latest_time: number
  status?: 'ok' | 'baseline' | 'error'
  error?: string
}

/**
 * One upstream pricing difference since the acknowledged baseline; an empty
 * model name with kind group_ratio is a supplier group ratio change
 */
export type UpstreamPriceChange = {
  channel_id: number
  channel_name: string
  model_name: string
  kind: 'added' | 'removed' | 'changed' | 'group_ratio'
  fields: Array<{ field: string; previous: unknown; current: unknown }>
}

/**
 * The supplier's latest price for a served model as a local pricing draft;
 * error is a locale key when the supplier row cannot become one
 */
export type UpstreamModelPrice = {
  channel_id: number
  channel_name: string
  pricing?: PricingValues
  error?: string
  in_sync: boolean
}

export type UpstreamPriceReport = {
  channels: UpstreamPriceChannel[]
  changes: UpstreamPriceChange[]
  models?: Record<string, UpstreamModelPrice>
}

export interface UpstreamPriceReportResponse {
  success: boolean
  message?: string
  data?: UpstreamPriceReport
}

/**
 * Missing models response
 */
export interface MissingModelsResponse {
  success: boolean
  message?: string
  data?: string[]
}

/**
 * Prefill groups response
 */
export interface PrefillGroupsResponse {
  success: boolean
  message?: string
  data?: PrefillGroup[]
}

// ============================================================================
// Form Data Types
// ============================================================================

/**
 * Model form schema
 */
export const modelFormSchema = z.object({
  id: z.number().optional(),
  model_name: z.string().min(1, 'Model name is required'),
  description: z.string().default(''),
  icon: z.string().default(''),
  tags: z.array(z.string()).default([]),
  vendor_id: z.number().optional(),
  endpoints: z.string().default(''),
  name_rule: z.number().min(0).max(3).default(0),
  status: z.boolean().default(true),
  sync_official: z.boolean().default(true),
})

export type ModelFormValues = z.infer<typeof modelFormSchema>

/**
 * Vendor form schema
 */
export const vendorFormSchema = z.object({
  id: z.number().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Vendor name is required')
    .max(128, 'Vendor name and icon must not exceed 128 characters.'),
  description: z.string().default(''),
  icon: z
    .string()
    .max(128, 'Vendor name and icon must not exceed 128 characters.')
    .default(''),
  version: z.string().optional(),
})

export type VendorFormValues = z.infer<typeof vendorFormSchema>

/**
 * Prefill group form schema
 */
export const prefillGroupFormSchema = z.object({
  id: z.number().optional(),
  name: z.string().min(1, 'Group name is required'),
  description: z.string().optional(),
  type: z.enum(['model', 'tag', 'endpoint']),
  items: z.union([z.string(), z.array(z.string())]),
})

export type PrefillGroupFormValues = z.infer<typeof prefillGroupFormSchema>

// ============================================================================
// Utility Types
// ============================================================================

/**
 * Name rule type
 */
export type NameRule = 0 | 1 | 2 | 3 // exact, prefix, contains, suffix

/**
 * Model status type
 */
export const MODEL_STATUS = {
  DISABLED: 0,
  ENABLED: 1,
  /** Listed but refusing new requests, such as when the supplier is out of stock. */
  UNAVAILABLE: 2,
} as const

export type ModelStatus = (typeof MODEL_STATUS)[keyof typeof MODEL_STATUS]

/**
 * Quota type
 */
export type QuotaType = 0 | 1 // usage-based, per-call

/**
 * Sync locale
 */
export type SyncLocale = 'zh' | 'zh-CN' | 'en' | 'ja'

/**
 * Sync upstream source
 */
export type SyncSource = 'official'

// ============================================================================
// Model Deployments Types
// ============================================================================

/**
 * Model tab type
 */
export type ModelTabCategory =
  | 'metadata'
  | 'onboarding'
  | 'vendors'
  | 'categories'
  | 'deployments'

/**
 * Deployment entity from API
 */
export interface Deployment {
  id: string | number
  container_name?: string
  deployment_name?: string
  name?: string
  status?: string
  provider?: string
  /**
   * Human readable string returned by backend, e.g. "2 hour 15 minutes"
   * or "completed".
   */
  time_remaining?: string
  /**
   * Remaining minutes (numeric) returned by backend.
   */
  compute_minutes_remaining?: number
  /**
   * Served minutes (numeric) returned by backend.
   */
  compute_minutes_served?: number
  /**
   * Completed percent (0-100) returned by backend.
   */
  completed_percent?: number
  hardware_info?: string | Record<string, unknown>
  hardware_name?: string
  brand_name?: string
  hardware_quantity?: number
  created_at?: string | number
  updated_at?: string | number
  [key: string]: unknown
}

/**
 * Deployment settings response
 */
export interface DeploymentSettingsResponse {
  success: boolean
  message?: string
  data?: {
    enabled?: boolean
    [key: string]: unknown
  }
}

/**
 * List deployments response
 */
export interface ListDeploymentsResponse {
  success: boolean
  message?: string
  data?: {
    items?: Deployment[]
    total?: number
    page?: number
    page_size?: number
    status_counts?: Record<string, number>
  }
}

/**
 * Deployment logs response
 */
export interface DeploymentLogsResponse {
  success: boolean
  message?: string
  data?: {
    logs?: Array<{
      timestamp?: string
      level?: string
      message?: string
      source?: string
    }>
    cursor?: string
  }
}
