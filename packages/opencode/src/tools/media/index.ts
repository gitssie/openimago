/**
 * Media tools domain — image, video, and audio generation tools.
 *
 * Architecture follows the OpenSwarm pattern:
 *   - Unified tool schema (e.g. imago_generate_image) exposed to the LLM.
 *   - Internal provider dispatch by model via Effect IOC ProviderRouter.
 *
 * Tools:
 *   - imago_generate_image  — text-to-image
 *   - imago_generate_video  — text-to-video
 *   - imago_generate_audio  — text-to-speech
 *
 * Provider backends (not yet implemented):
 *   - OpenAI (GPT-Image-2, DALL·E)
 *   - Google (Gemini, Imagen)
 *   - FLUX (via fal.ai / replicate)
 *   - Sora, Veo, Seedance (video)
 *   - Tencent Cloud (TTS) for audio
 *
 * Currently using mock providers for skeleton wiring.
 */

export { createGenerateImageTool } from "./generate-image.js"
export { createGenerateVideoTool } from "./generate-video.js"
export { createGenerateAudioTool } from "./generate-audio.js"
