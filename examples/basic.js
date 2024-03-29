// A super-basic example

import WaveSurfer from '../dist/wavesurfer.js'

const wavesurfer = WaveSurfer.create({
  container: document.body,
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
  url: '/examples/audio.wav',
})

wavesurfer.once('interaction', () => {
  setTimeout(() => {
    wavesurfer.play()
  }, 100)
})
