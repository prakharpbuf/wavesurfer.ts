// Timeline plugin

import WaveSurfer from '/dist/wavesurfer.js'
import MinimapPlugin from '/dist/plugins/minimap.js'

// Create an instance of WaveSurfer
const ws = WaveSurfer.create({
  container: document.body,
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
  url: '/examples/audio.wav',
  minPxPerSec: 100,
})

// Initialize the Timeline plugin
const minimap = ws.registerPlugin(
  MinimapPlugin.create({
    height: 50,
    waveColor: '#ddd',
    progressColor: '#999',
  }),
)

ws.once('seekClick', () => {
  setTimeout(() => {
    ws.play()
  }, 100)
})
