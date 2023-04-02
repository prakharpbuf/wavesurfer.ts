import { resolve } from 'path'
import { defineConfig } from 'vite'
import dts from 'vite-plugin-dts'

export default defineConfig({
  publicDir: false,
  plugins: [dts()],
  build: {
    emptyOutDir: false,
    lib: {
      // Could also be a dictionary or array of multiple entry points
      entry: resolve(__dirname, 'src/plugins/multitrack.ts'),
      name: 'multitrack',
      fileName: 'plugins/multitrack',
    },
    rollupOptions: {
      output: {
        // Provide global variables to use in the UMD build
        // for externalized deps
        globals: {
          multitrack: 'Multitrack',
        },
      },
    },
  },
})
