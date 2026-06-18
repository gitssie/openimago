// omniclip state types (transcribed from omniclip@1.0.7 s/context/types.ts).
// Production copy promoted from the spike (openimago-2re7/4eiw). The mapper
// targets these so it stays decoupled from the vendored fork's runtime imports.

/** omniclip base effect — every clip on a track is an "effect". */
export interface OmniEffect {
  id: string
  /** x-offset on the track, in ms of timeline time. */
  start_at_position: number
  /** clip duration on the timeline, ms. */
  duration: number
  /** trim start WITHIN the source media, ms. */
  start: number
  /** trim end within the source media, ms. */
  end: number
  /** 0-based track index. */
  track: number
}

export interface OmniVideoEffect extends OmniEffect {
  kind: 'video'
  thumbnail: string
  raw_duration: number
  frames: number
  rect: OmniEffectRect
  /** content-hash of the imported File; the ONLY link from effect -> media. */
  file_hash: string
  name: string
}

export interface OmniAudioEffect extends OmniEffect {
  kind: 'audio'
  raw_duration: number
  file_hash: string
  name: string
}

export interface OmniEffectRect {
  width: number
  height: number
  scaleX: number
  scaleY: number
  position_on_canvas: { x: number; y: number }
  rotation: number
}

export type OmniAnyEffect = OmniVideoEffect | OmniAudioEffect

export interface OmniTrack {
  id: string
}

/** The historical (undoable) slice of omniclip state — what we read back. */
export interface OmniHistoricalState {
  effects: OmniAnyEffect[]
  tracks: OmniTrack[]
}
