/**
 * Provider router — re-exported from the Effect Layer IOC media module.
 *
 * All provider dispatch is now managed through Effect services.
 * See src/lib/media/ for the full architecture:
 *   - MediaProvider           — adapter contract per provider
 *   - MediaProviderRegistry   — central provider registry
 *   - MediaProviderRouter     — resolve provider by model/kind
 *   - MediaGenerationService  — tool-facing generation service
 *   - mediaDefaultLayer       — composed IOC layer
 *
 * For plain types (non-Effect), import from src/lib/media/provider.ts
 * directly or use the re-exports below.
 */

// Re-export all media types and services
export {
  type GenerateImageParams,
  type GenerateVideoParams,
  type GenerateResult,
  GenerateError,
  type MediaProvider,
  mockImageProvider,
  mockVideoProvider,
} from "./media/provider.js"

export { type ProviderCapability } from "./media/router.js"

export {
  type MediaConfigData as MediaConfig,
  type ProviderConfig,
} from "./media/config.js"

export { mediaDefaultLayer } from "./media/layer.js"
