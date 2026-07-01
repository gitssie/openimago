import {generate_id} from "@benev/slate"

import {Compositor} from "../controller.js"
import {Actions} from "../../../actions.js"
import {collaboration, omnislate} from "../../../context.js"
import {VideoEffect, State} from "../../../types.js"
import {isEffectMuted} from "../utils/is_effect_muted.js"
import {Video} from "../../../../components/omni-media/types.js"
import {find_place_for_new_effect} from "../../timeline/utils/find_place_for_new_effect.js"

export class VideoManager extends Map<string, {sprite: PIXI.Sprite, transformer: PIXI.Container}> {
	#effect_canvas = new Map<string, HTMLCanvasElement>()
	#videoElements = new Map<string, PIXI.Texture<PIXI.TextureSource<HTMLVideoElement>>>()

	constructor(private compositor: Compositor, private actions: Actions) {
		super()
	}

	create_and_add_video_effect(video: Video, state: State) {
		collaboration.broadcastMedia(video)
		const adjusted_duration_to_timebase = Math.floor(video.duration / (1000/state.timebase)) * (1000/state.timebase) - 200
		const effect: VideoEffect = {
			frames: video.frames,
			id: generate_id(),
			name: video.file.name,
			kind: "video",
			file_hash: video.hash,
			raw_duration: video.duration,
			duration: adjusted_duration_to_timebase,
			start_at_position: 0,
			start: 0,
			end: adjusted_duration_to_timebase,
			track: 0,
			thumbnail: video.thumbnail,
			rect: {
				position_on_canvas: {x: this.compositor.app.stage.width / 2, y: this.compositor.app.stage.height / 2},
				width: video.element.videoWidth,
				height: video.element.videoHeight,
				rotation: 0,
				scaleX: 1,
				scaleY: 1,
				pivot: {
					x: video.element.videoWidth / 2,
					y: video.element.videoHeight / 2
				}
			}
		}
		const {position, track} = find_place_for_new_effect(state.effects, state.tracks)
		effect.start_at_position = position!
		effect.track = track
		this.add_video_effect(effect, video.file)
	}

	add_video_effect(effect: VideoEffect, file: File, recreate?: boolean) {
		const element = document.createElement('video')
		const obj = URL.createObjectURL(file)
		element.src = obj
		element.width = effect.rect.width
		element.height = effect.rect.height
		const texture = PIXI.Texture.from(element)
		this.#videoElements.set(effect.id, texture)
		texture.baseTexture.resource.autoPlay = false
		const sprite = new PIXI.Sprite(texture)
		sprite.pivot.set(effect.rect.pivot.x, effect.rect.pivot.y)
		sprite.x = effect.rect.position_on_canvas.x
		sprite.y = effect.rect.position_on_canvas.y
		sprite.scale.set(effect.rect.scaleX, effect.rect.scaleY)
		sprite.rotation = effect.rect.rotation * (Math.PI / 180)
		sprite.width = effect.rect.width
		sprite.height = effect.rect.height
		sprite.eventMode = "static"
		sprite.cursor = "pointer"
		sprite.filters = []
		// COVER-FIT (openimago-wmns Pass B.6; pixi adaptation of video-manager.patch.ts).
		// The lines above size the sprite to effect.rect (the 1080×1920 portrait canvas for a
		// hydrated cut clip), which non-uniformly scales a 16:9 source (letterbox/stretch).
		// The approved design FILLS the 9:16 frame, so uniformly scale the sprite to COVER the
		// canvas (scale = max(canvasW/vidW, canvasH/vidH)) centered — overriding the rect
		// width/height scaling above. Uses the <video>'s INTRINSIC size, so it runs once
		// metadata is known (this is the single creation point → race-free on add + recreate).
		this.#cover_fit(sprite, element, effect)
		//@ts-ignore
		const transformer = new PIXI.Transformer({
			boxRotationEnabled: true,
			translateEnabled: false, // implemented my own translate which work with align guidelines
			group: [sprite],
			stage: this.compositor.app.stage,
			wireframeStyle: {
				thickness: 2,
				color: 0xff0000
			}
		})
		transformer.name = generate_id()
		transformer.ignoreAlign = true
		sprite.on('pointerdown', (e) => {
			this.compositor.canvasElementDrag.onDragStart(e, sprite, transformer)
			this.compositor.app.stage.addChild(transformer)
		})
		;(sprite as any).effect = { ...effect }
		//@ts-ignore
		sprite.ignoreAlign = false
		this.set(effect.id, {sprite, transformer})
		const canvas = document.createElement("canvas")
		canvas.getContext("2d")!.imageSmoothingEnabled = false
		this.#effect_canvas.set(effect.id, canvas)
		if(recreate) {return}
		this.actions.add_video_effect(effect)
	}

	// Uniformly scale `sprite` to COVER the project canvas, centered (openimago-wmns B.6).
	// Reads the <video>'s INTRINSIC size; if metadata isn't loaded yet (videoWidth 0), defers
	// once to `loadedmetadata` (the HTML-spec guarantee that videoWidth/Height are populated).
	#cover_fit(sprite: PIXI.Sprite, element: HTMLVideoElement, effect: VideoEffect) {
		const apply = () => {
			const vidW = element.videoWidth
			const vidH = element.videoHeight
			if(!vidW || !vidH) {return}
			const canvasW = this.compositor.app.screen.width
			const canvasH = this.compositor.app.screen.height
			// COVER = the larger ratio so the smaller dimension still fills the canvas; uniform
			// (same X and Y) so the source aspect is preserved (no distortion). Overflow is
			// cropped by the renderer. Center via texture-space pivot + canvas-center position.
			const scale = Math.max(canvasW / vidW, canvasH / vidH)
			sprite.pivot.set(vidW / 2, vidH / 2)
			sprite.position.set(canvasW / 2, canvasH / 2)
			sprite.scale.set(scale, scale)
			// Persist cover-fit values back into effect.rect so update_canvas_objects does not
			// override them on subsequent compose_effects calls (openimago-wmns Bug 1 fix).
			effect.rect.scaleX = scale
			effect.rect.scaleY = scale
			effect.rect.pivot = { x: vidW / 2, y: vidH / 2 }
			effect.rect.position_on_canvas = { x: canvasW / 2, y: canvasH / 2 }
			// Force GPU texture upload + repaint so first frame isn't black (openimago-wmns Bug 2 fix).
			sprite.texture.baseTexture.update()
			this.compositor.request_render()
		}
		if(element.videoWidth && element.videoHeight) {
			apply()
		} else {
			element.addEventListener("loadedmetadata", apply, {once: true})
		}
	}

	add_video_to_canvas(effect: VideoEffect) {
		const video = this.get(effect.id)
		if(video) {
			this.compositor.app.stage.addChild(video.sprite)
			video.sprite.zIndex = omnislate.context.state.tracks.length - effect.track
			video.transformer.zIndex = omnislate.context.state.tracks.length - effect.track
		}
	}

	remove_video_from_canvas(effect: VideoEffect) {
		const video = this.get(effect.id)
		if(video) {
			this.compositor.app.stage.removeChild(video.sprite)
			this.compositor.app.stage.removeChild(video.transformer)
		}
	}

	//reset element to state before export started
	reset(effect: VideoEffect) {
		const video = this.get(effect.id)?.sprite
		if(video) {
			const videoTexture = this.#videoElements.get(effect.id)!
			video.texture = videoTexture
			video.texture.update()
		}
	}

	draw_decoded_frame(effect: VideoEffect, frame: VideoFrame) {
		const video = this.get(effect.id)?.sprite
		if(video) {
			const canvas = this.#effect_canvas.get(effect.id)!
			canvas.width = video.width
			canvas.height = video.height
			canvas.getContext("2d")!.drawImage(frame, 0,0, video.width, video.height)
			const texture = PIXI.Texture.from(canvas)
			video.texture = texture
			video.texture.update()
		}
	}

	pause_videos() {
		for(const effect of this.compositor.currently_played_effects.values()) {
			if(effect.kind === "video") {
				const video = this.get(effect.id)?.sprite
				if(video) {
					const element = video.texture.baseTexture.resource.source as HTMLVideoElement
					element.pause()
				}
			}
		}
	}

	async play_videos() {
		for(const effect of this.compositor.currently_played_effects.values()) {
			if(effect.kind === "video") {
				const video = this.get(effect.id)?.sprite
				if(video) {
					const element = video.texture.baseTexture.resource.source as HTMLVideoElement
					const isMuted = isEffectMuted(effect)
					element.muted = isMuted
					await element.play()
				}
			}
		}
	}

	pause_video(effect: VideoEffect) {
		const video = this.get(effect.id)?.sprite
		if(video) {
			const element = video.texture.baseTexture.resource.source as HTMLVideoElement
			element.pause()
		}
	}

	async play_video(effect: VideoEffect) {
		const video = this.get(effect.id)?.sprite
		if(video) {
			const element = video.texture.baseTexture.resource.source as HTMLVideoElement
			await element.play()
		}
	}
}
