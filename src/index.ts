/**
 * The entrypoint for the action.
 */
import { installLLGo } from './install'

async function run(): Promise<void> {
  await installLLGo()
}

// eslint-disable-next-line @typescript-eslint/no-floating-promises
run()
