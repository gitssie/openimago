// Build a "添加到对话" reference attachment from a Cut clip's current media
// (openimago-e0n3). This is the NON-UPLOAD path: the clip's media already lives
// as an artifact (the source Shot's completed Run), so we construct a
// PendingAttachment that is already 'uploaded' — url + mime + assetId in hand,
// NO re-upload. Pure: facts in, attachment out; unit-tested.

import type { StoryRunSummary } from '../../components/session-workspace/types'

/** Mirrors useAgentSession.PendingAttachment (kept structural to avoid a cycle). */
export interface ReferenceAttachment {
  id: string
  name: string
  mime: string
  url: string
  status: 'uploaded'
  progress: 100
  assetId?: string
}

/** Guess a mime from a media URL extension; defaults to mp4 (clip media). */
export function mimeFromUrl(url: string): string {
  const clean = url.split('?')[0] ?? url
  const ext = clean.includes('.') ? clean.slice(clean.lastIndexOf('.') + 1).toLowerCase() : ''
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'png':
      return 'image/png'
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    case 'mp3':
      return 'audio/mpeg'
    case 'wav':
      return 'audio/wav'
    default:
      return 'video/mp4'
  }
}

/**
 * Build a reference attachment from a source shot's media run.
 * `run` is the shot's chosen completed run (resolved by the caller). Returns
 * null when the run has no usable preview media. `genId` injects the id so the
 * builder stays pure/testable.
 */
export function buildReferenceAttachment(
  sourceShotId: string,
  run: Pick<StoryRunSummary, 'previewUrl' | 'thumbnailUrl' | 'resultArtifactId'> | null,
  genId: () => string,
): ReferenceAttachment | null {
  const url = run?.previewUrl ?? run?.thumbnailUrl ?? null
  if (!run || !url) return null

  const attachment: ReferenceAttachment = {
    id: genId(),
    name: `${sourceShotId}.mp4`,
    mime: mimeFromUrl(url),
    url,
    status: 'uploaded',
    progress: 100,
  }
  if (run.resultArtifactId) attachment.assetId = run.resultArtifactId
  return attachment
}
