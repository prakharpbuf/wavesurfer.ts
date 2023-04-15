import EventEmitter, { type GeneralEventTypes } from './event-emitter.js'

type PlayerOptions = {
  media?: HTMLMediaElement
  autoplay?: boolean
  playbackRate?: number
}

class Player<T extends GeneralEventTypes> extends EventEmitter<T> {
  protected media: HTMLMediaElement
  protected subscriptions: Array<() => void> = []
  private isExternalMedia = false
  private hasPlayedOnce = false

  constructor(options: PlayerOptions) {
    super()

    if (options.media) {
      this.media = options.media
      this.isExternalMedia = true
    } else {
      this.media = document.createElement('audio')
    }

    this.subscriptions.push(
      // Track the first play() call
      this.onceMediaEvent('play', () => {
        this.hasPlayedOnce = true
      }),
    )

    // Autoplay
    if (options.autoplay) {
      this.media.autoplay = true
    }
    // Speed
    if (options.playbackRate != null) {
      this.media.playbackRate = options.playbackRate
    }
  }

  protected onMediaEvent(
    event: keyof HTMLMediaElementEventMap,
    callback: () => void,
    options?: AddEventListenerOptions,
  ): () => void {
    this.media.addEventListener(event, callback, options)
    return () => this.media.removeEventListener(event, callback)
  }

  protected onceMediaEvent(event: keyof HTMLMediaElementEventMap, callback: () => void): () => void {
    return this.onMediaEvent(event, callback, { once: true })
  }

  protected loadUrl(src: string) {
    this.media.src = src
  }

  public destroy() {
    this.media.pause()

    this.subscriptions.forEach((unsubscribe) => unsubscribe())

    if (!this.isExternalMedia) {
      this.media.remove()
    }
  }

  /** Start playing the audio */
  public play(): Promise<void> {
    return this.media.play()
  }

  /** Pause the audio */
  public pause(): void {
    this.media.pause()
  }

  /** Check if the audio is playing */
  public isPlaying() {
    return this.media.currentTime > 0 && !this.media.paused && !this.media.ended
  }

  /** Jumpt to a specific time in the audio (in seconds) */
  public setTime(time: number) {
    if (!this.hasPlayedOnce) {
      this.media.play()?.then?.(() => {
        setTimeout(() => this.media.pause(), 10)
      })
    }
    this.media.currentTime = time
  }

  /** Get the duration of the audio in seconds */
  public getDuration() {
    return this.media.duration
  }

  /** Get the current audio position in seconds */
  public getCurrentTime() {
    return this.media.currentTime
  }

  /** Get the audio volume */
  public getVolume() {
    return this.media.volume
  }

  /** Set the audio volume */
  public setVolume(volume: number) {
    this.media.volume = volume
  }

  /** Get the audio muted state */
  public getMuted() {
    return this.media.muted
  }

  /** Mute or unmute the audio */
  public setMuted(muted: boolean) {
    this.media.muted = muted
  }

  /** Get the playback speed */
  public getPlaybackRate(): number {
    return this.media.playbackRate
  }

  /** Set the playback speed, pass an optional false to NOT preserve the pitch */
  public setPlaybackRate(rate: number, preservePitch?: boolean) {
    // preservePitch is true by default in most browsers
    if (preservePitch != null) {
      this.media.preservesPitch = preservePitch
    }
    this.media.playbackRate = rate
  }

  /** Get the HTML media element */
  public getMediaElement() {
    return this.media
  }

  /** Set a sink id to change the audio output device */
  public setSinkId(sinkId: string): Promise<void> {
    // See https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/setSinkId
    const media = this.media as HTMLAudioElement & { setSinkId: (sinkId: string) => Promise<void> }
    return media.setSinkId(sinkId)
  }
}

export default Player
