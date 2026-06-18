// THROWAWAY SPIKE — openimago-2re7 (ADR 0007 GO/NO-GO gate)
// Delete this whole `_spike/omniclip/` directory once the gate is decided.
//
// These types are transcribed from the actual published package
// `omniclip@1.0.7` (file `s/context/types.ts`), pinned here so the mapping POC
// below typechecks WITHOUT adding omniclip as a real dependency during the spike.
// They are the contract the production mapping layer (Issue openimago-4eiw)
// would target.

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
