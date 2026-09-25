#!/usr/bin/env node

// Bundles app/javascript/*.* into app/assets/builds via esbuild, same as the
// plain `esbuild ... --external:/lurchmath/*` CLI invocation this replaces,
// except for one thing a CLI invocation can't do: it also rewrites this
// app's own "/lurchmath/..." import specifiers (see
// app/javascript/controllers/document_editor_controller.js) to the
// commit-versioned URL that config/initializers/lurch_vendor.rb actually
// serves the vendored tree at (see bin/vendor-lurch.mjs and package.json's
// "lurchSource" field for where that commit comes from). Those imports stay
// external either way -- this only changes the path string the browser
// resolves them from.
//
// Run via `npm run build` (add `-- --watch` for the Procfile.dev "js"
// process, which rebuilds on change instead of exiting).

import * as esbuild from 'esbuild'
import { readFileSync, readdirSync } from 'node:fs'
import { join, dirname, extname } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { lurchSource } = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
)
const lurchVendorRoot = `/lurch/${lurchSource.commit}`

const entryPoints = readdirSync(join(repoRoot, 'app/javascript'), { withFileTypes: true })
  .filter(entry => entry.isFile() && extname(entry.name) !== '')
  .map(entry => join('app/javascript', entry.name))

const rewriteLurchImports = {
  name: 'rewrite-lurch-imports',
  setup(build) {
    build.onResolve({ filter: /^\/lurchmath\// }, args => ({
      path: args.path.replace(/^\/lurchmath/, `${lurchVendorRoot}/lurchmath`),
      external: true
    }))
  }
}

const buildOptions = {
  entryPoints,
  bundle: true,
  sourcemap: true,
  format: 'esm',
  outdir: 'app/assets/builds',
  publicPath: '/assets',
  plugins: [ rewriteLurchImports ]
}

if (process.argv.includes('--watch')) {
  const context = await esbuild.context(buildOptions)
  await context.watch()
  console.log('esbuild watching for changes...')
} else {
  await esbuild.build(buildOptions)
}
