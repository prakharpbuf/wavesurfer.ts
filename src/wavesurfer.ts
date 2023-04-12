import Fetcher from './fetcher.js'
import Decoder from './decoder.js'
import Renderer from './renderer.js'
import Player from './player.js'
import { type GeneralEventTypes } from './event-emitter.js'
import Timer from './timer.js'
import BasePlugin from './base-plugin.js'

export type WaveSurferOptions = {
  /** HTML element or CSS selector */
  container: HTMLElement | string | null
  /** Height of the waveform in pixels */
  height?: number
  /** The color of the waveform */
  waveColor?: string
  /** The color of the progress mask */
  progressColor?: string
  /** The color of the playpack cursor */
  cursorColor?: string
  /** The cursor with */
  cursorWidth?: number
  /** If set, the waveform will be rendered in bars like so: ▁ ▂ ▇ ▃ ▅ ▂ */
  barWidth?: number
  /** Spacing between bars in pixels */
  barGap?: number
  /** Rounded borders for bars */
  barRadius?: number
  /** Minimum pixels per second of audio (zoom) */
  minPxPerSec?: number
  /** Stretch the waveform to fill the container, true by default */
  fillParent?: boolean
  /** Audio URL */
  url?: string
  /** Pre-computed audio data */
  peaks?: Float32Array[]
  /** Pre-computed duration */
  duration?: number
  /** Use an existing media element instead of creating one */
  media?: HTMLMediaElement
  /** Play the audio on load */
  autoplay?: boolean
  /** Is the waveform clickable? */
  interactive?: boolean
  /** Hide scrollbar **/
  noScrollbar?: boolean
}

const defaultOptions = {
  height: 128,
  waveColor: '#999',
  progressColor: '#555',
  cursorWidth: 1,
  minPxPerSec: 0,
  fillParent: true,
  interactive: true,
}

export type WaveSurferEvents = {
  decode: { duration: number }
  canplay: { duration: number }
  ready: { duration: number }
  play: void
  pause: void
  timeupdate: { currentTime: number }
  seeking: { currentTime: number }
  seekClick: { currentTime: number }
  zoom: { minPxPerSec: number }
  destroy: void
}

export type WaveSurferPluginParams = {
  wavesurfer: WaveSurfer
  container: HTMLElement
  wrapper: HTMLElement
}

class WaveSurfer extends Player<WaveSurferEvents> {
  public options: WaveSurferOptions & typeof defaultOptions
  private fetcher: Fetcher
  private decoder: Decoder
  private renderer: Renderer
  private timer: Timer
  private plugins: BasePlugin<GeneralEventTypes, unknown>[] = []
  private decodedData: AudioBuffer | null = null
  private canPlay = false

  /** Create a new WaveSurfer instance */
  public static create(options: WaveSurferOptions) {
    return new WaveSurfer(options)
  }

  /** Create a new WaveSurfer instance */
  constructor(options: WaveSurferOptions) {
    super({
      media: options.media,
      autoplay: options.autoplay,
    })

    this.options = Object.assign({}, defaultOptions, options)

    this.fetcher = new Fetcher()
    this.decoder = new Decoder()
    this.timer = new Timer()

    this.renderer = new Renderer({
      container: this.options.container,
      height: this.options.height,
      waveColor: this.options.waveColor,
      progressColor: this.options.progressColor,
      cursorColor: this.options.cursorColor,
      cursorWidth: this.options.cursorWidth,
      minPxPerSec: this.options.minPxPerSec,
      fillParent: this.options.fillParent,
      barWidth: this.options.barWidth,
      barGap: this.options.barGap,
      barRadius: this.options.barRadius,
      noScrollbar: this.options.noScrollbar,
    })

    this.initPlayerEvents()
    this.initRendererEvents()
    this.initTimerEvents()
    this.initReadyEvent()

    const url = this.options.url || this.options.media?.src
    if (url) {
      this.load(url, this.options.peaks, this.options.duration)
    }
  }

  private initPlayerEvents() {
    this.subscriptions.push(
      this.onMediaEvent('timeupdate', () => {
        const currentTime = this.getCurrentTime()
        this.renderer.renderProgress(currentTime / this.getDuration(), this.isPlaying())
        this.emit('timeupdate', { currentTime })
      }),

      this.onMediaEvent('play', () => {
        this.emit('play')
        this.timer.start()
      }),

      this.onMediaEvent('pause', () => {
        this.emit('pause')
        this.timer.stop()
      }),

      this.onMediaEvent('canplay', () => {
        this.canPlay = true
        this.emit('canplay', { duration: this.getDuration() })
      }),

      this.onMediaEvent('seeking', () => {
        this.emit('seeking', { currentTime: this.getCurrentTime() })
      }),
    )
  }

  private initRendererEvents() {
    // Seek on click
    this.subscriptions.push(
      this.renderer.on('click', ({ relativeX }) => {
        if (this.options.interactive) {
          const time = this.getDuration() * relativeX
          this.seekTo(time)
          this.emit('seekClick', { currentTime: this.getCurrentTime() })
        }
      }),
    )
  }

  private initTimerEvents() {
    // The timer fires every 16ms for a smooth progress animation
    this.subscriptions.push(
      this.timer.on('tick', () => {
        const currentTime = this.getCurrentTime()
        this.renderer.renderProgress(currentTime / this.getDuration(), true)
        this.emit('timeupdate', { currentTime })
      }),
    )
  }

  private initReadyEvent() {
    const emitReady = () => {
      if (this.decodedData && this.canPlay) {
        this.emit('ready', { duration: this.getDuration() })
      }
    }
    this.subscriptions.push(this.on('decode', emitReady), this.on('canplay', emitReady))
  }

  /** Load an audio file by URL, with optional pre-decoded audio data */
  public async load(url: string, channelData?: Float32Array[], duration?: number) {
    this.decodedData = null
    this.canPlay = false

    this.loadUrl(url)

    // Fetch and decode the audio of no pre-computed audio data is provided
    if (channelData == null) {
      const audio = await this.fetcher.load(url)
      const data = await this.decoder.decode(audio)
      this.decodedData = data
    } else {
      if (!duration) {
        duration =
          (await new Promise((resolve) => {
            this.onceMediaEvent('loadedmetadata', () => resolve(this.getDuration()))
          })) || 0
      }

      this.decodedData = {
        duration,
        numberOfChannels: channelData.length,
        sampleRate: channelData[0].length / duration,
        getChannelData: (i) => channelData[i],
      } as AudioBuffer
    }

    this.renderer.render(this.decodedData)

    this.emit('decode', { duration: this.decodedData.duration })
  }

  /** Zoom in or out */
  public zoom(minPxPerSec: number) {
    if (!this.decodedData) {
      throw new Error('No audio loaded')
    }
    this.renderer.zoom(this.decodedData, minPxPerSec)
    this.emit('zoom', { minPxPerSec })
  }

  /** Register and initialize a plugin */
  public registerPlugin<T extends BasePlugin<GeneralEventTypes, Options>, Options>(
    CustomPlugin: new (params: WaveSurferPluginParams, options: Options) => T,
    options: Options,
  ): T {
    const plugin = new CustomPlugin(
      {
        wavesurfer: this,
        container: this.renderer.getContainer(),
        wrapper: this.renderer.getWrapper(),
      },
      options,
    )

    this.plugins.push(plugin)

    plugin.once('destroy', () => {
      this.plugins = this.plugins.filter((p) => p !== plugin)
    })

    return plugin
  }

  /** Get the decoded audio data */
  public getDecodedData(): AudioBuffer | null {
    return this.decodedData
  }

  public getDuration(): number {
    return this.decodedData?.duration || this.getMediaElement()?.duration || 0
  }

  /** Toggle if the waveform should react to clicks */
  public toggleInteractive(isInteractive: boolean) {
    this.options.interactive = isInteractive
  }

  /** Unmount wavesurfer */
  public destroy() {
    this.emit('destroy')
    this.plugins.forEach((plugin) => plugin.destroy())
    this.timer.destroy()
    this.decoder.destroy()
    this.renderer.destroy()
    super.destroy()
  }
}

export default WaveSurfer