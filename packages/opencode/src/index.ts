//
// OpenImago OpenCode Plugin — barrel export
//
// Re-exports all plugin modules for local development and typecheck
// visibility.  At runtime the compiled JS lives under
// /root/.config/opencode/ and is auto-discovered by OpenCode.
//

// ── Plugin entry ──────────────────────────────────────────────────────
export { OpenImagoPlugin, default as defaultOpenImagoPlugin }
  from "./plugins/openimago.js"

// ── Tool registry ─────────────────────────────────────────────────────
export { createToolRegistry } from "./tools/registry.js"
export { createImagoStatusTool } from "./tools/diagnostics/imago-status.js"

// ── Media Effect Layer IOC ────────────────────────────────────────────
export {
  type MediaProvider,
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerateResult,
  GenerateError,
  mockImageProvider,
  mockVideoProvider,
  mockAudioProvider,
} from "./lib/media/provider.js"

export {
  MediaProviderRegistry,
  type MediaProviderRegistryInterface,
} from "./lib/media/registry.js"

export {
  MediaProviderRouter,
  type MediaProviderRouterInterface,
  type ProviderCapability,
  ResolveError,
} from "./lib/media/router.js"

export {
  MediaGenerationService,
  type MediaGenerationServiceInterface,
} from "./lib/media/service.js"

export {
  MediaConfig,
  type MediaConfigData,
  type ProviderConfig,
} from "./lib/media/config.js"

export { mediaDefaultLayer } from "./lib/media/layer.js"

// ── Shared lib ────────────────────────────────────────────────────────
export { type OpenImagoConfig, loadConfig } from "./lib/config.js"
export { type ToolResultPayload, textResult, jsonResult, errorResult }
  from "./lib/tool-result.js"
