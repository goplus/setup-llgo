import * as core from '@actions/core'
import * as semver from 'semver'
import fs from 'fs'
import path from 'path'
import os from 'os'
import { execSync } from 'child_process'

const REPO = 'https://github.com/goplus/llgo.git'

/**
 * The main function for the action.
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function installLLGo(): Promise<void> {
  try {
    const versionSpec = resolveVersionInput() || ''
    const tagVersions = semver.rsort(fetchTags().filter(v => semver.valid(v)))
    let version: string | null = null
    if (!versionSpec || versionSpec === 'latest') {
      version = tagVersions[0]
      core.warning(
        `No llgo-version specified, using latest version: ${version}`
      )
    } else {
      version = semver.maxSatisfying(tagVersions, versionSpec)
      if (!version) {
        core.warning(
          `No llgo-version found that satisfies '${versionSpec}', trying branches...`
        )
        const branchVersions = fetchBranches()
        if (!branchVersions.includes(versionSpec)) {
          throw new Error(
            `No llgo-version found that satisfies '${versionSpec}' in branches or tags`
          )
        }
        version = ''
      }
    }

    let checkoutVersion = ''
    if (version) {
      core.info(`Selected version ${version} by spec ${versionSpec}`)
      checkoutVersion = `v${version}`
      core.setOutput('llgo-version-verified', true)
    } else {
      core.warning(
        `Unable to find a version that satisfies the version spec '${versionSpec}', trying branches...`
      )
      checkoutVersion = versionSpec
      core.setOutput('llgo-version-verified', false)
    }
    const llgoDir = cloneBranchOrTag(checkoutVersion)
    install(llgoDir)
    // if (version) {
    //   checkVersion(version)
    // }
    core.setOutput('llgo-version', llgoVersion())
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
  }
}

export function selectVersion(
  versions: string[],
  versionSpec?: string
): string | null {
  const sortedVersions = semver.rsort(versions.filter(v => semver.valid(v)))
  if (!versionSpec || versionSpec === 'latest') {
    return sortedVersions[0]
  }
  return semver.maxSatisfying(sortedVersions, versionSpec)
}

function cloneBranchOrTag(versionSpec: string): string {
  // git clone https://github.com/llgo/llgo.git with tag $versionSpec to $HOME/workdir/llgo
  const workDir = path.join(os.homedir(), 'workdir')
  if (fs.existsSync(workDir)) {
    fs.rmSync(workDir, { recursive: true })
  }
  fs.mkdirSync(workDir)
  core.info(`Cloning llgo ${versionSpec} to ${workDir} ...`)
  const cmd = `git clone --depth 1 --branch ${versionSpec} ${REPO}`
  execSync(cmd, { cwd: workDir, stdio: 'inherit' })
  core.info('llgo cloned')
  return path.join(workDir, 'llgo')
}

function install(llgoDir: string): void {
  core.info(`Installing llgo ${llgoDir} ...`)
  const bin = path.join(os.homedir(), 'bin')
  execSync('go install ./cmd/llgo', {
    cwd: llgoDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      GOBIN: bin
    }
  })
  core.addPath(bin)
  core.info('llgo installed')
}

// function checkVersion(versionSpec: string): string {
//   core.info(`Testing llgo ${versionSpec} ...`)
//   const actualVersion = llgoVersion()
//   if (actualVersion !== versionSpec) {
//     throw new Error(
//       `Installed llgo version ${actualVersion} does not match expected version ${versionSpec}`
//     )
//   }
//   core.info(`Installed llgo version ${actualVersion}`)
//   return actualVersion
// }

function llgoVersion(): string {
  const out = execSync('llgo version', { env: process.env })
  return out.toString().trim().replace(/^v/, '')
}

function fetchTags(): string[] {
  const cmd = `git -c versionsort.suffix=- ls-remote --tags --sort=v:refname ${REPO}`
  const out = execSync(cmd).toString()
  const versions = out
    .split('\n')
    .filter(s => s)
    .map(s => s.split('\t')[1].replace('refs/tags/', ''))
    .map(s => s.replace(/^v/, ''))
  return versions
}

function fetchBranches(): string[] {
  const cmd = `git -c versionsort.suffix=- ls-remote --heads --sort=v:refname ${REPO}`
  const out = execSync(cmd).toString()
  const versions = out
    .split('\n')
    .filter(s => s)
    .map(s => s.split('\t')[1].replace('refs/heads/', ''))
  return versions
}

function resolveVersionInput(): string | undefined {
  let version = process.env['INPUT_LLGO_VERSION']
  const versionFilePath = process.env['INPUT_LLGO_VERSION_FILE']

  if (version && versionFilePath) {
    core.warning(
      'Both llgo-version and llgo-version-file inputs are specified, only llgo-version will be used'
    )
  }

  if (version) {
    return version
  }

  if (versionFilePath) {
    if (!fs.existsSync(versionFilePath)) {
      throw new Error(
        `The specified llgo version file at: ${versionFilePath} does not exist`
      )
    }
    version = parseGopVersionFile(versionFilePath)
  }

  return version
}

export function parseGopVersionFile(versionFilePath: string): string {
  const contents = fs.readFileSync(versionFilePath).toString()

  if (
    path.basename(versionFilePath) === 'go.mod' ||
    path.basename(versionFilePath) === 'go.work'
  ) {
    const match = contents.match(/\/\/ llgo (\d+(\.\d+)*)/m)
    return match ? match[1] : ''
  }

  return contents.trim()
}
