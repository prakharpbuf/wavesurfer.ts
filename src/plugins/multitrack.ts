import WaveSurfer, { type WaveSurferOptions } from '../index.js'
import RegionsPlugin, { type RegionsPluginOptions } from './regions.js'
import TimelinePlugin, { type TimelinePluginOptions } from './timeline.js'
import EnvelopePlugin, { type EnvelopePluginOptions } from './envelope.js'

type MultitrackTracks = Array<{
  id: string | number
  url?: string
  peaks?: WaveSurferOptions['peaks']
  draggable?: boolean
  startPosition: number
  startCue?: number
  endCue?: number
  fadeInEnd?: number
  fadeOutStart?: number
  markers?: Array<{
    time: number
    label?: string
    color?: string
  }>
  regions?: Array<{
    startTime: number
    endTime: number
    label?: string
    color?: string
  }>
  options?: WaveSurferOptions
}>

type MultitrackOptions = {
  container: HTMLElement
  minPxPerSec?: number
  cursorColor?: string
  cursorWidth?: number
  trackBackground?: string
  trackBorderColor?: string
  rightButtonDrag?: boolean
  onTrackPositionUpdate?: (id: string | number, startPosition: number) => void
  onTrackCueUpdate?: (id: string | number, startCue?: number, endCue?: number) => void
}

class MultiTrack {
  private tracks: MultitrackTracks
  private options: MultitrackOptions
  private audios: Array<HTMLAudioElement> = []
  private wavesurfers: Array<WaveSurfer> = []
  private durations: Array<number> = []
  private currentTime = 0
  private maxDuration = 0
  private rendering: ReturnType<typeof initRendering>
  private isDragging = false
  private frameRequest: number | null = null
  private timer: ReturnType<typeof setTimeout> | null = null
  private subscriptions: Array<() => void> = []

  static create(tracks: MultitrackTracks, options: MultitrackOptions): MultiTrack {
    return new MultiTrack(tracks, options)
  }

  constructor(tracks: MultitrackTracks, options: MultitrackOptions) {
    this.tracks = tracks.map((track) => ({
      ...track,
      startPosition: track.startPosition || 0,
      peaks: track.peaks || (track.url ? undefined : [new Float32Array()]),
    }))
    this.options = options

    this.rendering = initRendering(this.tracks, this.options)

    this.initAudios().then((durations) => {
      this.durations = durations

      const maxDuration = this.tracks.reduce((max, track, index) => {
        return Math.max(max, track.startPosition + durations[index])
      }, 0)

      this.rendering.setMainWidth(durations, maxDuration)

      this.rendering.addClickHandler((position) => {
        if (this.isDragging) return
        this.seekTo(position * maxDuration)
      })

      this.maxDuration = maxDuration

      this.initWavesurfers()
      this.initTimeline()

      this.rendering.containers.forEach((container, index) => {
        const drag = initDragging(container, (delta: number) => this.onDrag(index, delta), options.rightButtonDrag)

        this.wavesurfers[index].once('destroy', () => {
          drag?.destroy()
        })
      })
    })
  }

  private initAudios(): Promise<number[]> {
    this.audios = this.tracks.map((track) => new Audio(track.url))

    return Promise.all(
      this.audios.map((audio) => {
        return new Promise<number>((resolve) => {
          if (!audio.src) return resolve(0)

          audio.addEventListener(
            'canplay',
            () => {
              resolve(audio.duration)
            },
            { once: true },
          )
        })
      }),
    )
  }

  private initWavesurfers() {
    const wavesurfers = this.tracks.map((track, index) => {
      // Create a wavesurfer instance
      const ws = WaveSurfer.create({
        ...track.options,
        container: this.rendering.containers[index],
        minPxPerSec: 0,
        media: this.audios[index],
        peaks: track.peaks,
        cursorColor: 'transparent',
        cursorWidth: 0,
        interactive: false,
      })

      // Regions and markers
      const wsRegions = ws.registerPlugin(RegionsPlugin, {
        draggable: false,
        resizable: true,
        dragSelection: false,
      } as RegionsPluginOptions)

      this.subscriptions.push(
        ws.once('decode', () => {
          // Start and end cues
          if (track.startCue != null || track.endCue != null) {
            const { startCue = 0, endCue = this.durations[index] } = track
            const startCueRegion = wsRegions.add(0, startCue, '', 'rgba(0, 0, 0, 0.7)')
            const endCueRegion = wsRegions.add(endCue, endCue + this.durations[index], '', 'rgba(0, 0, 0, 0.7)')

            // Allow resizing only from one side
            startCueRegion.element.firstElementChild?.remove()
            endCueRegion.element.lastChild?.remove()

            // Update the start and end cues on resize
            this.subscriptions.push(
              wsRegions.on('region-updated', ({ region }) => {
                this.setIsDragging()

                if (region === startCueRegion || region === endCueRegion) {
                  if (region === startCueRegion) {
                    track.startCue = region.endTime
                  } else {
                    track.endCue = region.startTime
                  }
                  this.options.onTrackCueUpdate?.(track.id, track.startCue, track.endCue)
                }
              }),
            )
          }

          // Render regions
          if (track.regions) {
            track.regions.forEach((params) => {
              const region = wsRegions.add(params.startTime || 0, params.endTime, params.label, params.color)
              if (!params.startTime) {
                region.element.firstElementChild?.remove()
              }
            })
          }

          // Render markers
          if (track.markers) {
            track.markers.forEach((marker) => {
              wsRegions.add(marker.time, marker.time, marker.label, marker.color)
            })
          }
        }),
      )

      // Envelope
      ws.registerPlugin(EnvelopePlugin, {
        startTime: track.startCue,
        endTime: track.endCue,
        fadeInEnd: track.fadeInEnd,
        fadeOutStart: track.fadeOutStart,
      } as EnvelopePluginOptions)

      return ws
    })

    this.wavesurfers = wavesurfers
  }

  private initTimeline() {
    this.wavesurfers[0].registerPlugin(TimelinePlugin, {
      duration: this.maxDuration,
      container: this.rendering.containers[0].parentElement,
    } as TimelinePluginOptions)
  }

  private updatePosition(time: number, autoCenter = false) {
    const precisionSeconds = 0.3
    this.currentTime = time
    this.rendering.updateCursor(time / this.maxDuration, autoCenter)
    const isPaused = !this.isPlaying()

    // Update the current time of each audio
    this.tracks.forEach((track, index) => {
      const audio = this.audios[index]
      const duration = this.durations[index]
      const newTime = time - track.startPosition

      if (Math.abs(audio.currentTime - newTime) > precisionSeconds) {
        audio.currentTime = newTime
      }

      // If the position is out of the track bounds, pause it
      if (isPaused || newTime < 0 || newTime > duration) {
        !audio.paused && audio.pause()
      } else if (!isPaused) {
        // If the position is in the track bounds, play it
        audio.paused && audio.play()
      }

      // Unmute if cue is reached
      const newVolume = newTime >= (track.startCue || 0) && newTime < (track.endCue || Infinity) ? 1 : 0
      if (newVolume !== audio.volume) audio.volume = newVolume
    })
  }

  private setIsDragging() {
    // Prevent click events when dragging
    this.isDragging = true
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => (this.isDragging = false), 300)
  }

  private onDrag(index: number, delta: number) {
    this.setIsDragging()
    const newTime = this.tracks[index].startPosition + delta * this.maxDuration
    this.onMove(index, newTime)
  }

  private onMove(index: number, newStartPosition: number) {
    const track = this.tracks[index]
    if (!track.draggable) return

    const mainIndex = this.tracks.findIndex((item) => item.url && !item.draggable)
    const mainTrack = this.tracks[mainIndex]
    const minStart = (mainTrack ? mainTrack.startPosition : 0) - this.durations[index]
    const maxStart = mainTrack ? mainTrack.startPosition + this.durations[mainIndex] : this.maxDuration

    if (newStartPosition >= minStart && newStartPosition <= maxStart) {
      track.startPosition = newStartPosition
      this.rendering.setContainerOffsets()
      this.updatePosition(this.currentTime)
      this.options.onTrackPositionUpdate?.(track.id, track.startPosition)
    }
  }

  private findCurrentTracks(): number[] {
    // Find the audios at the current time
    const indexes: number[] = []

    this.tracks.forEach((track, index) => {
      if (
        track.url &&
        this.currentTime >= track.startPosition &&
        this.currentTime < track.startPosition + this.durations[index]
      ) {
        indexes.push(index)
      }
    })

    if (indexes.length === 0) {
      const minStartTime = Math.min(...this.tracks.filter((t) => t.url).map((track) => track.startPosition))
      indexes.push(this.tracks.findIndex((track) => track.startPosition === minStartTime))
    }

    return indexes
  }

  private startSync() {
    const onFrame = () => {
      const position = this.audios.reduce<number>((pos, audio, index) => {
        if (!audio.paused) {
          pos = Math.max(pos, audio.currentTime + this.tracks[index].startPosition)
        }
        return pos
      }, this.currentTime)

      if (position > this.currentTime) {
        this.updatePosition(position, true)
      }

      this.frameRequest = requestAnimationFrame(onFrame)
    }

    onFrame()
  }

  public play() {
    this.startSync()

    const indexes = this.findCurrentTracks()
    indexes.forEach((index) => {
      this.audios[index]?.play()
    })
  }

  public pause() {
    this.audios.forEach((audio) => audio.pause())
  }

  public isPlaying() {
    return this.audios.some((audio) => !audio.paused)
  }

  public getCurrentTime() {
    return this.currentTime
  }

  public seekTo(time: number) {
    const wasPlaying = this.isPlaying()
    this.updatePosition(time)
    if (wasPlaying) this.play()
  }

  public zoom(pxPerSec: number) {
    this.options.minPxPerSec = pxPerSec
    this.wavesurfers.forEach((ws, index) => this.tracks[index].url && ws.zoom(pxPerSec))
    this.rendering.setMainWidth(this.durations, this.maxDuration)
    this.rendering.setContainerOffsets()
  }

  public destroy() {
    if (this.frameRequest) cancelAnimationFrame(this.frameRequest)

    this.rendering.destroy()

    this.audios.forEach((audio) => {
      audio.pause()
      audio.src = ''
    })

    this.wavesurfers.forEach((ws) => {
      ws.destroy()
    })
  }
}

function initRendering(tracks: MultitrackTracks, options: MultitrackOptions) {
  let pxPerSec = 0
  let durations: number[] = []
  let mainWidth = 0

  // Create a common container for all tracks
  const scroll = document.createElement('div')
  scroll.setAttribute('style', 'width: 100%; overflow-x: scroll; overflow-y: hidden; user-select: none;')
  const wrapper = document.createElement('div')
  wrapper.style.position = 'relative'
  scroll.appendChild(wrapper)
  options.container.appendChild(scroll)

  // Create a common cursor
  const cursor = document.createElement('div')
  cursor.setAttribute('style', 'height: 100%; position: absolute; z-index: 10; top: 0; left: 0')
  cursor.style.backgroundColor = options.cursorColor || '#000'
  cursor.style.width = `${options.cursorWidth ?? 1}px`
  wrapper.appendChild(cursor)
  const { clientWidth } = wrapper

  // Create containers for each track
  const containers = tracks.map((_, index) => {
    const container = document.createElement('div')

    if (options.trackBorderColor && index > 0) {
      const borderDiv = document.createElement('div')
      borderDiv.setAttribute('style', `width: 100%; height: 2px; background-color: ${options.trackBorderColor}`)
      wrapper.appendChild(borderDiv)
    }

    if (options.trackBackground) {
      container.style.background = options.trackBackground
    }
    wrapper.appendChild(container)

    return container
  })

  // Set the positions of each container
  const setContainerOffsets = () => {
    containers.forEach((container, i) => {
      const offset = tracks[i].startPosition * pxPerSec
      container.style.width = `${durations[i] * pxPerSec}px`
      container.style.transform = `translateX(${offset}px)`
      if (tracks[i].draggable) container.style.cursor = 'move'
    })
  }

  return {
    containers,

    // Set the start offset
    setContainerOffsets,

    // Set the container width
    setMainWidth: (trackDurations: number[], maxDuration: number) => {
      durations = trackDurations
      pxPerSec = Math.max(options.minPxPerSec || 0, clientWidth / maxDuration)
      mainWidth = pxPerSec * maxDuration
      wrapper.style.width = `${mainWidth}px`
      setContainerOffsets()
    },

    // Update cursor position
    updateCursor: (position: number, autoCenter: boolean) => {
      cursor.style.left = `${Math.min(100, position * 100)}%`

      // Update scroll
      const { clientWidth, scrollLeft } = scroll
      const center = clientWidth / 2
      const minScroll = autoCenter ? center : clientWidth
      const pos = position * mainWidth

      if (pos > scrollLeft + minScroll || pos < scrollLeft) {
        scroll.scrollLeft = pos - center
      }
    },

    // Click to seek
    addClickHandler: (onClick: (position: number) => void) => {
      wrapper.addEventListener('click', (e) => {
        const rect = wrapper.getBoundingClientRect()
        const x = e.clientX - rect.left
        const position = x / wrapper.offsetWidth
        onClick(position)
      })
    },

    // Destroy the container
    destroy: () => {
      scroll.remove()
    },
  }
}

function initDragging(container: HTMLElement, onDrag: (delta: number) => void, rightButtonDrag = false) {
  const wrapper = container.parentElement
  if (!wrapper) return

  // Dragging tracks to set position
  let dragStart: number | null = null

  container.addEventListener('contextmenu', (e) => {
    rightButtonDrag && e.preventDefault()
  })

  // Drag start
  container.addEventListener('mousedown', (e) => {
    if (rightButtonDrag && e.button !== 2) return
    const rect = wrapper.getBoundingClientRect()
    dragStart = e.clientX - rect.left
  })

  // Drag end
  const onMouseUp = (e: MouseEvent) => {
    if (dragStart != null) {
      e.stopPropagation()
      dragStart = null
    }
  }

  // Drag move
  const onMouseMove = (e: MouseEvent) => {
    if (dragStart == null) return
    const rect = wrapper.getBoundingClientRect()
    const x = e.clientX - rect.left
    const diff = x - dragStart
    if (diff > 1 || diff < -1) {
      dragStart = x
      onDrag(diff / wrapper.offsetWidth)
    }
  }

  document.body.addEventListener('mouseup', onMouseUp)
  document.body.addEventListener('mousemove', onMouseMove)

  return {
    destroy: () => {
      document.body.removeEventListener('mouseup', onMouseUp)
      document.body.removeEventListener('mousemove', onMouseMove)
    },
  }
}

export default MultiTrack
