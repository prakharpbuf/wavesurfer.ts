// Regions plugin

import WaveSurfer from '../dist/wavesurfer.js'
import RegionsPlugin from '../dist/plugins/regions.js'

// Create an instance of WaveSurfer
const ws = WaveSurfer.create({
  container: document.body,
  waveColor: 'rgb(200, 0, 200)',
  progressColor: 'rgb(100, 0, 100)',
  url: '/examples/audio.wav',
})

// Initialize the Regions plugin
const wsRegions = ws.registerPlugin(RegionsPlugin.create())

// Give regions a random color when they are created
const random = (min, max) => Math.random() * (max - min) + min
const randomColor = () => `rgba(${random(0, 255)}, ${random(0, 255)}, ${random(0, 255)}, 0.5)`

// Create some regions at specific time ranges
ws.on('decode', () => {
  wsRegions.add(4, 7, 'First region', randomColor())
  wsRegions.add(9, 10, 'Middle region', randomColor())
  wsRegions.add(12, 17, 'Last region', randomColor())
  wsRegions.add(19, 19, 'Marker', randomColor())
  wsRegions.add(20, 20, 'Second marker', randomColor())
})

wsRegions.enableDragSelection({
  color: 'rgba(255, 0, 0, 0.1)',
})

// Loop a region on click
let loop = true
let activeRegion = null

wsRegions.on('region-clicked', (region) => {
  activeRegion = region
  setTimeout(() => region.play(), 10)
})

// Track the time
ws.on('timeupdate', (currentTime) => {
  // When the end of the region is reached
  if (activeRegion && ws.isPlaying() && currentTime >= activeRegion.end) {
    if (loop) {
      // If looping, jump to the start of the region
      ws.setTime(activeRegion.start)
    } else {
      // Otherwise, exit the region
      activeRegion = null
    }
  }
})

ws.on('interaction', () => (activeRegion = null))

/*
  <html>
    <div style="margin-bottom: 2em">
      <label>
        <input type="checkbox" checked="${loop}" />
        Loop regions on click
      </label>

      <label style="margin-left: 2em">
        Zoom: <input type="range" min="10" max="1000" value="10" />
      </label>
    </div>
  </html>
*/

// Toggle looping with a checkbox
document.querySelector('input[type="checkbox"]').onclick = (e) => {
  loop = e.target.checked
}

// Update the zoom level on slider change
ws.once('decode', () => {
  document.querySelector('input[type="range"]').oninput = (e) => {
    const minPxPerSec = Number(e.target.value)
    ws.zoom(minPxPerSec)
  }
})
