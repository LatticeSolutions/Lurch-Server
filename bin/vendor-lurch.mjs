#!/usr/bin/env node

// Populates public/lde and public/lurchmath from the `lde` and `lurchmath`
// subdirectories of github.com/kenmonks/lurch, at the commit pinned in
// package.json's "lurchSource" field. Runs automatically via the
// "postinstall" npm script.
//
// Fetches a plain HTTPS tarball (GitHub's codeload endpoint) rather than
// using npm's git-dependency resolution: npm's git+path dependency syntax
// forces a `git clone` over SSH for GitHub-hosted repos, which requires SSH
// keys that aren't guaranteed to be present in every dev machine or CI/Docker
// build. The tarball endpoint needs no auth for a public repo and no git
// client at all.
//
// Only a curated subset of each upstream directory is needed at runtime in
// the browser; the rest (tests, docs, build tooling, package.json, etc.) is
// left out of public/.

import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, cpSync, writeFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'
import { tmpdir } from 'node:os'

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const { lurchSource } = JSON.parse(
  readFileSync(join(repoRoot, 'package.json'), 'utf8')
)

const { repo, commit } = lurchSource
const tarballUrl = `https://codeload.github.com/${repo}/tar.gz/${commit}`

const workDir = mkdtempSync(join(tmpdir(), 'vendor-lurch-'))
const tarballPath = join(workDir, 'lurch.tar.gz')
const extractDir = join(workDir, 'extracted')

console.log(`Downloading ${tarballUrl}`)
const response = await fetch(tarballUrl)
if (!response.ok) {
  throw new Error(`Failed to download ${tarballUrl}: ${response.status} ${response.statusText}`)
}
writeFileSync(tarballPath, Buffer.from(await response.arrayBuffer()))

mkdirSync(extractDir, { recursive: true })
execFileSync('tar', [
  '-xzf', tarballPath,
  '-C', extractDir,
  '--strip-components=1',
  `${repo.split('/')[1]}-${commit}/lde`,
  `${repo.split('/')[1]}-${commit}/lurchmath`
])

const vendor = (name, { includeFile, dirs, filter }) => {
  const src = join(extractDir, name)
  const dest = join(repoRoot, 'public', name)
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })

  for (const dir of dirs) {
    cpSync(join(src, dir), join(dest, dir), { recursive: true, filter })
  }

  for (const entry of readdirSync(src, { withFileTypes: true })) {
    if (!entry.isFile() || !includeFile(entry.name)) continue
    cpSync(join(src, entry.name), join(dest, entry.name))
  }
}

const ldeSrcExclude = [ 'src/experimental/docs', 'src/experimental/tutorials' ]
  .map(p => join(extractDir, 'lde', ...p.split('/')))
vendor('lde', {
  includeFile: () => false,
  dirs: [ 'src', 'dependencies' ],
  filter: source => !ldeSrcExclude.some(excluded => source === excluded || source.startsWith(excluded + '/'))
})

const lurchmathExclude = new Set([ 'playwright.config.js' ])
vendor('lurchmath', {
  includeFile: name => !lurchmathExclude.has(name) && /\.js$|\.css$|\.html$|^favicon\.ico$/.test(name),
  dirs: [ 'parsers' ]
})

rmSync(workDir, { recursive: true, force: true })

console.log(`Vendored lde and lurchmath from ${repo}@${commit} into public/`)
