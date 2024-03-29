import EventEmitter, { type GeneralEventTypes } from './event-emitter.js'
import type WaveSurfer from './wavesurfer.js'

export type GenericPlugin = BasePlugin<GeneralEventTypes, unknown>

export type WaveSurferPluginParams = {
  wavesurfer: WaveSurfer
  container: HTMLElement
  wrapper: HTMLElement
}

export class BasePlugin<EventTypes extends GeneralEventTypes, Options> extends EventEmitter<EventTypes> {
  protected wavesurfer?: WaveSurfer
  protected container?: HTMLElement
  protected wrapper?: HTMLElement
  protected subscriptions: (() => void)[] = []
  protected options: Options

  constructor(options: Options) {
    super()
    this.options = options
  }

  init(params: WaveSurferPluginParams) {
    this.wavesurfer = params.wavesurfer
    this.container = params.container
    this.wrapper = params.wrapper
  }

  destroy() {
    this.subscriptions.forEach((unsubscribe) => unsubscribe())
  }
}

export default BasePlugin
